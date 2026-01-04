import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { globalScan } from '@ai-orbiter/core/src/registry/scan';
import { rebuildRegistry } from '@ai-orbiter/core/src/registry/rebuild';
import { logActivity } from '@ai-orbiter/core/src/db/dal';

export const scanRouter = router({
  globalScan: publicProcedure
    .input(z.object({}).optional())
    .mutation(async () => {
      const result = await rebuildRegistry();

      logActivity('scan_completed', 'scan', null, 'Global scan', `Found ${result.importedCount} servers`);
      return {
        candidates: [],
        snapshots: [],
        warnings: [],
        conflicts: result.conflicts,
        importedCount: result.importedCount,
      };
    }),

  scanProject: publicProcedure
    .input(z.string())
    .mutation(async ({ input: projectPath }) => {
      const result = await globalScan();
      logActivity('scan_completed', 'scan', null, 'Project scan', projectPath);
      return result;
    }),

  rebuildRegistry: publicProcedure
    .mutation(async () => {
      await rebuildRegistry();
      logActivity('scan_completed', 'scan', null, 'Registry rebuild', null);
      return { success: true };
    })
});
