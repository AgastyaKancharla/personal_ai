import { createClient } from '@supabase/supabase-js';

// Server-only client (service role key never reaches the browser). Every
// caller of this file must run in an API route, not a client component.
export function supabaseServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are not configured.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const TRACKER_ROW_ID = 'main';
