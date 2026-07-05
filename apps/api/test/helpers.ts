/**
 * Shared e2e helpers. Tests are integration tests against a running api (+ csms +
 * worker) backed by local Postgres + Redis. We NEVER mock Stripe —
 * tests that can't reach credentials mark themselves SKIP and the runner surfaces
 * that (per docs/AGENT_CONTEXT.md non-negotiables).
 */
import { createHash, createHmac } from 'node:crypto';
import { prisma } from '@edna/db';

// The API identity model is `User.id === the auth user id` (a UUID). Derive a
// deterministic UUID-shaped id from the email so createSupabaseUser and the dev
// token below agree, and the tRPC user-bootstrap (findUnique by id) matches.
function testUserId(email: string): string {
  const h = createHash('sha256').update(email).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3300';

export const HAS_SUPABASE = process.env.E2E_LIVE === '1';
export const HAS_SERVICE_ROLE = process.env.E2E_LIVE === '1';
export const HAS_STRIPE = !!process.env.STRIPE_SECRET_KEY;

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
  const url =
    kind === 'query' && input !== undefined
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
  const id = testUserId(email);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      id,
      email,
      fullName: email.split('@')[0] || 'Test User',
    },
    update: {},
    select: { id: true },
  });
  return user.id;
}

export async function signIn(email: string, password: string): Promise<string> {
  void password;
  const payload = Buffer.from(
    JSON.stringify({
      uid: testUserId(email),
      email,
      name: email.split('@')[0] || 'Test User',
      emailVerified: true,
    }),
  ).toString('base64url');
  const secret = process.env.AUTH_DEV_SECRET ?? 'ednacharge-test-auth-secret';
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

export async function grantAccess(userId: string, role: 'driver' | 'host'): Promise<void> {
  await prisma.userAccessGrant.upsert({
    where: { userId_role: { userId, role } },
    create: { userId, role, source: 'manual' },
    update: {},
  });
}
