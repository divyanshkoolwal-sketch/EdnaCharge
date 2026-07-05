/** @file apps/csms/src/lib/supabase.ts. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger.js';

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.warn('SUPABASE not configured — Realtime broadcasts disabled for csms');
    return null;
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}
