import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { loadEnv } from '@edna/config';
import { initSentry, Sentry } from './sentry.js';
import { logger } from './logger.js';
import { appRouter, type AppRouter } from './router.js';
import { createContext } from './trpc.js';
import { registerStripeWebhooks } from './webhooks/stripe.js';

async function main() {
  const env = loadEnv();
  initSentry();

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'api',
    uptimeSec: Math.round(process.uptime()),
  }));

  app.get('/_sentry-test', async () => {
    Sentry.captureException(new Error('sentry-smoke: api'));
    await Sentry.flush(2000);
    return { fired: true };
  });

  await registerStripeWebhooks(app);

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
      onError({ error, path }) {
        logger.error({ err: error, path }, 'tRPC error');
        Sentry.captureException(error);
      },
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>);

  const port = env.API_PORT;
  await app.listen({ port, host: '0.0.0.0' });
  logger.info({ port }, 'api listening');
}

main().catch((err) => {
  logger.error({ err }, 'api failed to start');
  process.exit(1);
});
