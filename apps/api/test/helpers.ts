/**
 * Shared e2e helpers. Tests are integration tests against a running api (+ csms +
 * worker) backed by local Postgres + Redis. We NEVER mock Stripe —
 * tests that can't reach credentials mark themselves SKIP and the runner surfaces
 * that (per CLAUDE.md non-negotiable #2).
 */
import { createHmac } from 'node:crypto';
import { prisma } from '@edna/db';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';
export const CSMS_URL = process.env.E2E_CSMS_URL ?? 'http://localhost:3002';

export const HAS_SUPABASE = process.env.E2E_LIVE === '1';
export const HAS_SERVICE_ROLE = process.env.E2E_LIVE === '1';
export const HAS_STRIPE = !!process.env.STRIPE_SECRET_KEY;

/** True when a full live stack is expected. Lets test suites mark themselves
 *  SKIP — not silently fake-pass. */
export const LIVE = process.env.E2E_LIVE === '1';

export function skipReason(required: Array<[string, boolean]>): string | null {
  const missing = required.filter(([, ok]) => !ok).map(([n]) => n);
  return missing.length ? `[SKIP — missing ${missing.join(', ')}]` : null;
}

/** Minimal tRPC-over-HTTP caller — avoids pulling in @trpc/client. */
export async function trpc(
  path: string,
  token: string,
  input: unknown,
  kind: 'query' | 'mutation' = 'mutation',
): Promise<unknown> {
  // The api uses tRPC v11 with NO transformer (no superjson), so the wire
  // format is the bare input — neither query strings nor mutation bodies
  // wrap in `{ json: ... }`. The earlier `{ json: input }` wrapper here was
  // wrong and made every test mutation appear to send `undefined` fields.
  const base = `${API_URL}/trpc/${path}`;
  const url = kind === 'query' && input !== undefined
    ? `${base}?input=${encodeURIComponent(JSON.stringify(input))}`
    : base;
  const res = await fetch(url, {
    method: kind === 'mutation' ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: kind === 'mutation' ? JSON.stringify(input) : undefined,
  });
  const body = (await res.json()) as {
    result?: { data?: unknown };
    error?: unknown;
  };
  if (!res.ok || body.error) {
    throw new Error(
      `tRPC ${path} ${kind} failed: ${res.status} ${JSON.stringify(body.error ?? body)}`,
    );
  }
  // No transformer ⇒ payload sits directly on result.data.
  return body.result?.data;
}

export async function createSupabaseUser(email: string, password: string): Promise<string> {
  void password;
  const firebaseUid = `test-${email}`;
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      firebaseUid,
      email,
      fullName: email.split('@')[0] || 'Test User',
    },
    update: { firebaseUid },
    select: { id: true },
  });
  return user.id;
}

export async function signIn(email: string, password: string): Promise<string> {
  void password;
  const payload = Buffer.from(
    JSON.stringify({
      uid: `test-${email}`,
      email,
      name: email.split('@')[0] || 'Test User',
      emailVerified: true,
    }),
  ).toString('base64url');
  const secret = process.env.FIREBASE_AUTH_DEV_SECRET ?? 'ednacharge-test-firebase-auth';
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `dev.${payload}.${signature}`;
}

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

/** Poll for a DB predicate to become true — our substitute for Supabase Realtime
 *  in server-side tests. */
export async function waitFor<T>(
  pred: () => Promise<T | null>,
  timeoutMs = 10_000,
  intervalMs = 200,
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await pred();
    if (v) return v;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('waitFor timed out');
}

export async function deleteUserByEmail(email: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { email } });
  if (u) await prisma.user.delete({ where: { id: u.id } }).catch(() => void 0);
}
