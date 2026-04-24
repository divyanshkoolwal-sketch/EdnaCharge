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
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  SENTRY_DSN_API: z.string().url().optional().or(z.literal('')),
  SENTRY_DSN_CSMS: z.string().url().optional().or(z.literal('')),
  SENTRY_DSN_WORKER: z.string().url().optional().or(z.literal('')),

  API_PORT: z.coerce.number().int().positive().default(3000),
  CSMS_PORT: z.coerce.number().int().positive().default(3100),
  WORKER_PORT: z.coerce.number().int().positive().default(3200),
});

export type Env = z.infer<typeof EnvSchema>;

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
