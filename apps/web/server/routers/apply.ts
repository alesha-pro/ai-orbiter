import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { dryRunApply } from '@ai-orbiter/core/src/apply/dry-run';
import { applyChanges } from '@ai-orbiter/core/src/apply/orchestrator';
import { restoreBackup } from '@ai-orbiter/core/src/backup';
import { getAllMcpServersWithBindings } from '@ai-orbiter/core/src/db/dal';
import { McpServer, ClientBinding } from '@ai-orbiter/core/src/db/types';
import { DiffResult, DiffEntry } from '@ai-orbiter/core/src/diff/calculator';

function getCurrentState() {
  const all = getAllMcpServersWithBindings();
  const servers: McpServer[] = [];
  const bindings: ClientBinding[] = [];

  for (const item of all) {
    const { bindings: itemBindings, ...server } = item;
    servers.push(server);
    bindings.push(...itemBindings);
  }

  return { servers, bindings };
}

export const applyRouter = router({
  previewDiff: publicProcedure
    .input(z.object({}))
    .query(async () => {
      const { servers, bindings } = getCurrentState();
      
      const clients = new Set<string>();
      for (const b of bindings) clients.add(b.client);
      
      const entries: DiffEntry[] = [];
      for (const client of clients) {
        entries.push({
          client,
          filePath: '',
          changes: []
        });
      }
      
      const diff: DiffResult = {
        entries,
        summary: { totalChanges: entries.length, added: 0, removed: 0, modified: entries.length }
      };
      
      const previews = await dryRunApply(diff, servers, bindings);
      return previews;
    }),

  applyChanges: publicProcedure.mutation(async () => {
    const { servers, bindings } = getCurrentState();
    
    const clients = new Set<string>();
    for (const b of bindings) clients.add(b.client);
    
    const entries: DiffEntry[] = [];
    for (const client of clients) {
      entries.push({
        client,
        filePath: '',
        changes: []
      });
    }
    
    const diff: DiffResult = {
        entries,
        summary: { totalChanges: entries.length, added: 0, removed: 0, modified: entries.length }
    };

    return await applyChanges(diff, servers, bindings);
  }),

  rollbackToBackup: publicProcedure
    .input(z.object({ backupPath: z.string(), originalPath: z.string() }))
    .mutation(async ({ input }) => {
      restoreBackup(input.backupPath, input.originalPath);
      return { success: true };
    })
});
