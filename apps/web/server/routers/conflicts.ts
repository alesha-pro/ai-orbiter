import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import {
  getPendingConflicts,
  getUnresolvedConflictsCount,
  markConflictResolved,
  clearAllPendingConflicts,
  getAllMcpServersWithBindings,
} from '@ai-orbiter/core/src/db/dal';
import { ClientBinding } from '@ai-orbiter/core/src/db/types';
import { rebuildRegistry } from '@ai-orbiter/core/src/registry/rebuild';
import {
  createBulkResolution,
  ConflictResolution,
  ResolutionAction,
} from '@ai-orbiter/core/src/registry/conflict-resolver';
import { ClientType } from '@ai-orbiter/core/src/adapters/types';
import { getAdapter } from '@ai-orbiter/core/src/adapters/registry';
import { updateSnapshotHashAfterApply } from '@ai-orbiter/core/src/drift/snapshot-utils';

async function applyToAllClients(): Promise<{ applied: string[]; errors: string[] }> {
  const allServers = getAllMcpServersWithBindings();
  const allBindings: ClientBinding[] = allServers.flatMap(s => s.bindings);
  const clients = [...new Set(allBindings.map(b => b.client))];
  
  const applied: string[] = [];
  const errors: string[] = [];
  
  for (const client of clients) {
    try {
      const adapter = getAdapter(client as ClientType);
      const clientBindings = allBindings.filter(b => b.client === client);
      const config = await adapter.compile(allServers, clientBindings);
      const result = await adapter.apply(config, { backup: true });
      
      if (result.success && result.filePath) {
        await updateSnapshotHashAfterApply(result.filePath, client);
        applied.push(client);
      } else if (result.error) {
        errors.push(`${client}: ${result.error.message}`);
      }
    } catch (e) {
      errors.push(`${client}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  
  return { applied, errors };
}

const ResolutionActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('merge'),
    baseClient: z.nativeEnum(ClientType),
    editedConfig: z.record(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('separate'),
    renames: z.array(z.object({
      client: z.nativeEnum(ClientType),
      newName: z.string(),
    })),
  }),
  z.object({
    type: z.literal('skip'),
  }),
]);

const ConflictResolutionSchema = z.object({
  conflictId: z.string(),
  conflictName: z.string().optional(),
  action: ResolutionActionSchema,
});

export const conflictsRouter = router({
  list: publicProcedure.query(() => {
    return getPendingConflicts();
  }),

  hasUnresolved: publicProcedure.query(() => {
    return getUnresolvedConflictsCount() > 0;
  }),

  count: publicProcedure.query(() => {
    return getUnresolvedConflictsCount();
  }),

  resolve: publicProcedure
    .input(z.array(ConflictResolutionSchema))
    .mutation(async ({ input }) => {
      const resolutions: ConflictResolution[] = input.map(r => ({
        conflictId: r.conflictId,
        conflictName: r.conflictName,
        action: r.action as ResolutionAction,
      }));

      for (const resolution of resolutions) {
        markConflictResolved(resolution.conflictId, resolution.action);
      }

      const result = await rebuildRegistry({ resolutions });
      
      const applyResult = await applyToAllClients();

      return {
        success: result.success,
        importedCount: result.importedCount,
        remainingConflicts: result.conflicts.length,
        appliedToClients: applyResult.applied,
        applyErrors: applyResult.errors,
      };
    }),

  bulkResolve: publicProcedure
    .input(z.object({
      action: z.enum(['use_client', 'keep_separate', 'skip_all']),
      client: z.nativeEnum(ClientType).optional(),
    }))
    .mutation(async ({ input }) => {
      const conflicts = getPendingConflicts();

      if (conflicts.length === 0) {
        return { success: true, importedCount: 0, resolvedCount: 0 };
      }

      const resolutions = createBulkResolution(
        conflicts,
        input.action,
        input.client
      );

      for (const resolution of resolutions) {
        markConflictResolved(resolution.conflictId, resolution.action);
      }

      const result = await rebuildRegistry({ resolutions });
      
      const applyResult = await applyToAllClients();

      return {
        success: result.success,
        importedCount: result.importedCount,
        resolvedCount: resolutions.length,
        appliedToClients: applyResult.applied,
        applyErrors: applyResult.errors,
      };
    }),

  rescan: publicProcedure.mutation(async () => {
    clearAllPendingConflicts();
    const result = await rebuildRegistry();
    return {
      success: result.success,
      importedCount: result.importedCount,
      conflicts: result.conflicts,
    };
  }),
});
