/** @file apps/api/src/index.ts. */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { loadEnv } from '@edna/config';
import { prisma } from '@edna/db';
import { initServiceSentry, Sentry } from '@edna/server-utils';
import { logger } from './logger.js';
import { appRouter, type AppRouter } from './router.js';
import { createContext } from './trpc.js';
import { registerStripeWebhooks } from './webhooks/stripe.js';
import { registerLegalPages } from './legal.js';

async function main() {
  const env = loadEnv();
  initServiceSentry('api', 'SENTRY_DSN_API', logger);

  // Defense-in-depth: refuse to boot a production server with any dev auth /
  // Stripe bypass enabled. Dev tokens use a known HMAC secret, so a misconfig
  // here would let anyone forge auth for any user.
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_BYPASS === '1') {
    throw new Error('Refusing to boot: ENABLE_DEV_BYPASS must never be set in production.');
  }

  // Fail fast in production if the API is missing the creds it needs to actually
  // function. The shared env schema stays permissive (csms/worker don't use these
  // and must not crash), so the assertion lives here where they're consumed.
  // Without it a misconfigured deploy would pass /healthz while auth, payments,
  // Supabase, and OCPP-setup are silently dead.
  if (process.env.NODE_ENV === 'production') {
    const required: Record<string, string | undefined> = {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      // Connected-account events (account.updated → host onboarding completion +
      // grant) are signed by this secret; without it hosts can never go live.
      STRIPE_WEBHOOK_SECRET_CONNECT: process.env.STRIPE_WEBHOOK_SECRET_CONNECT,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    const missing = Object.entries(required)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length > 0) {
      throw new Error(`Refusing to boot: missing required production env: ${missing.join(', ')}`);
    }
    const csmsUrl = process.env.CSMS_PUBLIC_URL;
    if (!csmsUrl || !csmsUrl.startsWith('wss://')) {
      throw new Error('Refusing to boot: CSMS_PUBLIC_URL must be a wss:// URL in production.');
    }
  }

  // Trust a BOUNDED number of proxy hops (Render's load balancer = 1) rather than
  // the whole X-Forwarded-For chain. `trustProxy: true` trusts every hop, so a
  // client could spoof its IP via X-Forwarded-For and mint unlimited per-IP
  // rate-limit buckets, defeating brute-force/scraping protection. Configurable
  // via TRUST_PROXY_HOPS for deployments with a different number of front proxies.
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  const app = Fastify({
    logger: false,
    trustProxy: Number.isFinite(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1,
    // Avatar uploads are validated at 3 MB decoded base64 in auth.uploadAvatar.
    // JSON/base64 overhead pushes those requests over Fastify's 1 MB default.
    bodyLimit: 5 * 1024 * 1024,
  });
  // CORS: this API is consumed by the native mobile app (Authorization header,
  // no cookies), so browser cross-origin access is not needed in production.
  // Allow an explicit allowlist via CORS_ORIGINS; otherwise deny cross-origin
  // in production and reflect any origin only in dev.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
  await app.register(cors, {
    origin: corsOrigins && corsOrigins.length > 0
      ? corsOrigins
      : process.env.NODE_ENV === 'production'
        ? false
        : true,
  });

  // Security headers. CSP is disabled because this service is a JSON API plus a
  // couple of trivial inline-styled redirect pages; the valuable headers
  // (X-Content-Type-Options, HSTS, X-Frame-Options, etc.) still apply.
  await app.register(helmet, { contentSecurityPolicy: false });

  // Global rate limit (per IP). Generous for normal app + Stripe webhook
  // traffic; blunts brute-force / scraping / abuse of the expensive geo query.
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'api',
    uptimeSec: Math.round(process.uptime()),
  }));
  app.get('/readyz', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok' as const,
        service: 'api',
        dependencies: { database: 'ok' as const },
      };
    } catch (err) {
      logger.error({ err }, 'api readiness check failed');
      return reply.code(503).send({
        status: 'error' as const,
        service: 'api',
        dependencies: { database: 'error' as const },
      });
    }
  });

  // Debug-only: never expose in production (would let anyone spam the Sentry
  // quota / probe the deployment).
  if (process.env.NODE_ENV !== 'production') {
    app.get('/_sentry-test', async () => {
      Sentry.captureException(new Error('sentry-smoke: api'));
      await Sentry.flush(2000);
      return { fired: true, dsnConfigured: !!process.env.SENTRY_DSN_API };
    });
  }

  // Stripe Connect Express onboarding redirect targets. `startHostOnboarding`
  // creates an account link with these as return_url / refresh_url. The mobile
  // app opens the link in an in-app browser and polls `hostOnboardingStatus`,
  // so these pages just need to tell the host to return to the app — the
  // `account.updated` webhook + the poll do the actual state transition.
  const onboardingPage = (title: string, body: string) =>
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${title}</title><style>body{font-family:-apple-system,system-ui,sans-serif;background:#0F0F10;` +
    `color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}` +
    `.c{max-width:340px;text-align:center}h1{font-size:22px;margin:0 0 12px}p{color:#A0A0A8;line-height:1.5}` +
    `</style></head><body><div class="c"><h1>${title}</h1><p>${body}</p></div></body></html>`;

  app.get('/stripe/onboarding/return', async (_req, reply) => {
    reply
      .type('text/html')
      .send(onboardingPage('All set', 'You can close this window and return to EdnaCharge — your payout account is being verified.'));
  });

  app.get('/stripe/onboarding/refresh', async (_req, reply) => {
    reply
      .type('text/html')
      .send(onboardingPage('Link expired', 'This onboarding link expired. Close this window and tap “Continue to payouts” again in EdnaCharge to get a fresh link.'));
  });

  // Public legal pages (/privacy, /terms) — required by the app stores and
  // linked from the app.
  registerLegalPages(app);

  // AUDIT C2/L3: registerStripeWebhooks registers as an encapsulated Fastify
  // plugin so its raw-body content-type parser is scoped to its own routes.
  // Order is not significant with encapsulation — tRPC below parses JSON
  // normally regardless of how Stripe's plugin configures parsing internally.
  await registerStripeWebhooks(app);

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
      // Signal auth failures via a cheap response header. With httpBatchLink a
      // per-procedure UNAUTHORIZED comes back as HTTP 200 with the error in the
      // body, so the client can't tell from the status alone. This header lets it
      // trigger a token refresh WITHOUT clone()+regex-scanning every 200 body.
      responseMeta({ errors }) {
        if (errors.some((e) => e.code === 'UNAUTHORIZED')) {
          return { headers: { 'x-trpc-unauthorized': '1' } };
        }
        return {};
      },
      onError({ error, path }) {
        logger.error({ err: error, path }, 'tRPC error');
        Sentry.captureException(error);
      },
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>);

  // Render (and most PaaS) inject $PORT; fall back to the configured port locally.
  const port = Number(process.env.PORT) || env.API_PORT;
  await app.listen({ port, host: '0.0.0.0' });
  logger.info({ port }, 'api listening');

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'api shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      logger.error({ err, signal }, 'api shutdown failed');
      process.exit(1);
    }
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'api failed to start');
  process.exit(1);
});
