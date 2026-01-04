import { router, publicProcedure } from '../trpc';
import { scanRouter } from './scan';
import { registryRouter } from './registry';
import { applyRouter } from './apply';
import { conflictsRouter } from './conflicts';

export const appRouter = router({
  health: publicProcedure.query(() => 'ok'),
  scan: scanRouter,
  registry: registryRouter,
  apply: applyRouter,
  conflicts: conflictsRouter,
});

export type AppRouter = typeof appRouter;
