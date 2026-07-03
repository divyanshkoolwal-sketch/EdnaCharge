import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger.js';

let _client: SupabaseClient | null = null;

// Service-role Supabase client (bypasses RLS). Used for Storage uploads
// (avatars). Returns null if not configured so callers can degrade gracefully.
export function supabase(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.warn('SUPABASE not configured — avatar uploads disabled');
    return null;
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

const AVATAR_BUCKET = 'avatars';
let _bucketReady = false;

/**
 * Upload an avatar image to the public `avatars` bucket and return its public
 * URL. Creates the bucket on first use (idempotent). Throws if Storage isn't
 * configured or the upload fails.
 */
export async function uploadAvatar(
  userId: string,
  bytes: Buffer,
  mime: string,
): Promise<string> {
  const sb = supabase();
  if (!sb) throw new Error('Storage not configured');

  if (!_bucketReady) {
    // createBucket is idempotent-ish: it errors if the bucket exists, which we
    // treat as "already there".
    const { error } = await sb.storage.createBucket(AVATAR_BUCKET, { public: true });
    if (error && !/exist/i.test(error.message)) {
      logger.warn({ err: error }, 'createBucket(avatars) failed (continuing)');
    }
    _bucketReady = true;
  }

  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  // Deterministic path per user so a new upload replaces the old one (upsert).
  const path = `${userId}.${ext}`;
  const { error: upErr } = await sb.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (upErr) throw new Error(`Avatar upload failed: ${upErr.message}`);

  const { data } = sb.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // Cache-bust so clients don't show a stale cached image after re-upload.
  return `${data.publicUrl}?v=${Date.now()}`;
}
