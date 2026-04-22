import { z } from 'zod';

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
