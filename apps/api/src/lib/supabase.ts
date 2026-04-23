import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger.js';

let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
    throw new Error('Supabase env not configured');
  }
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

export async function verifyJwt(token: string): Promise<{ userId: string; email: string } | null> {
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? '' };
}
