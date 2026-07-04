import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabase } from './supabase.js';
import { logger } from '../logger.js';

// The verified identity contract the rest of the API depends on. `id` is the
// Supabase auth user id (auth.users.id) — which we also use as our public.User
// primary key, so RLS `auth.uid() = User.id` lines up.
export type VerifiedUser = {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
};

// ---------------------------------------------------------------------------
// Dev-token bypass (provider-independent; unchanged behavior).
// A `dev.<base64url-payload>.<hmac>` token, HMAC'd with FIREBASE_AUTH_DEV_SECRET
// (name kept for env compatibility). HARD-OFF in production.
// ---------------------------------------------------------------------------
function devTokenSecret(): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  const enabled =
    process.env.ENABLE_DEV_BYPASS === '1' || process.env.FIREBASE_AUTH_DEV_BYPASS === '1';
  if (!enabled) return null;
  const secret = process.env.FIREBASE_AUTH_DEV_SECRET;
  if (!secret || secret.length < 16) {
    logger.warn('dev token bypass enabled but FIREBASE_AUTH_DEV_SECRET is unset/too short — bypass disabled');
    return null;
  }
  return secret;
}

function verifyDevToken(token: string): VerifiedUser | null {
  const secret = devTokenSecret();
  if (!secret || !token.startsWith('dev.')) return null;
  const [, payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    uid: string;
    email?: string | null;
    name?: string | null;
    picture?: string | null;
    emailVerified?: boolean;
  };
  return {
    id: parsed.uid,
    email: parsed.email ?? null,
    name: parsed.name ?? null,
    avatarUrl: parsed.picture ?? null,
    emailVerified: parsed.emailVerified ?? true,
  };
}

// ---------------------------------------------------------------------------
// Supabase access-token verification.
// We validate the token against Supabase Auth (getUser) rather than verifying a
// JWT locally: it's correct regardless of the project's signing method (HS256
// secret vs asymmetric keys), needs no extra secret, and reflects
// bans/deletions (the equivalent of Firebase's checkRevoked). A short in-memory
// TTL cache keeps the per-request cost negligible.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 60_000;
const tokenCache = new Map<string, { user: VerifiedUser; exp: number }>();

export async function verifyAccessToken(token: string): Promise<VerifiedUser | null> {
  const dev = verifyDevToken(token);
  if (dev) return dev;

  const cached = tokenCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.user;

  const sb = supabase();
  if (!sb) {
    logger.error('SUPABASE not configured — cannot verify auth tokens');
    return null;
  }
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) {
      logger.warn({ code: (error as { code?: string } | null)?.code }, 'supabase: getUser rejected token');
      return null;
    }
    const u = data.user;
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const name = (meta.full_name ?? meta.name) as string | undefined;
    const avatarUrl = (meta.avatar_url ?? meta.picture) as string | undefined;
    const user: VerifiedUser = {
      id: u.id,
      email: u.email ?? null,
      name: typeof name === 'string' ? name : null,
      avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
      // Confirmed email (Supabase sets email_confirmed_at when confirmations are
      // off, and OAuth providers verify email), else honor a metadata flag.
      emailVerified: u.email_confirmed_at != null || meta.email_verified === true,
    };
    // Bound the cache so it can't grow unbounded; evict expired entries lazily.
    if (tokenCache.size > 5000) tokenCache.clear();
    tokenCache.set(token, { user, exp: Date.now() + CACHE_TTL_MS });
    return user;
  } catch (err) {
    logger.warn({ err }, 'supabase: getUser threw');
    return null;
  }
}
