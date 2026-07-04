/** @file packages/config/src/env.ts. */
import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Walk up from cwd to find the first `.env`. Works for every workspace package
// (apps/api, apps/csms, apps/worker, scripts/*), and is a no-op if none exists —
// which is the right behaviour in prod where env is injected by the platform.
function autoloadEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate, override: false });
      return;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
}
autoloadEnv();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_SECRET_CONNECT: z.string().optional(),

  // Symmetric key (pgcrypto) for encrypting stored OCPP passwords. Only the API
  // uses it; it validates presence at point of use (charger router) and throws a
  // clear error there. Kept permissive here so it can never crash a service at
  // boot (a too-short/absent key must not take down csms/worker, which don't use it).
  OCPP_SECRET_ENC_KEY: z.string().optional(),
  // Public CSMS websocket base shown to hosts, e.g. wss://csms.ednacharge.com.
  // Only the API consumes it; kept permissive so csms/worker never fail to boot.
  CSMS_PUBLIC_URL: z.string().optional(),

  SENTRY_DSN_API: z.string().url().optional().or(z.literal('')),
  SENTRY_DSN_CSMS: z.string().url().optional().or(z.literal('')),
  SENTRY_DSN_WORKER: z.string().url().optional().or(z.literal('')),

  API_PORT: z.coerce.number().int().positive().default(3000),
  CSMS_PORT: z.coerce.number().int().positive().default(3100),
  WORKER_PORT: z.coerce.number().int().positive().default(3200),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  if (!env.DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL is required in production.',
    });
  }
  if (!process.env.REDIS_URL || isLocalRedisUrl(env.REDIS_URL)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REDIS_URL'],
      message: 'REDIS_URL must be set to a non-local Redis endpoint in production.',
    });
  }
});

export type Env = z.infer<typeof EnvSchema>;

export function isLocalRedisUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '127.0.0.1' ||
      host.startsWith('127.') ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]'
    );
  } catch {
    return true;
  }
}

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n  ');
    throw new Error(`Invalid environment:\n  ${msg}`);
  }
  return parsed.data;
}
