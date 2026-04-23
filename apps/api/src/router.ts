import { router, publicProcedure } from './trpc.js';
import { authRouter } from './routers/auth.js';
import { paymentRouter } from './routers/payment.js';
import { chargerRouter } from './routers/charger.js';

export const appRouter = router({
  health: publicProcedure.query(() => ({
    status: 'ok' as const,
    service: 'api',
    at: new Date().toISOString(),
  })),
  auth: authRouter,
  payment: paymentRouter,
  charger: chargerRouter,
});

export type AppRouter = typeof appRouter;
