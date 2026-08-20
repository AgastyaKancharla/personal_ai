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

export interface ParseLogInsert {
  raw_text: string;
  engine: 'rules' | 'api';
  output: unknown;
  confidence: number | null;
}

/** Writes one parse_log row and returns its id, or null if the insert
 * failed — logging failures should never block filing the user's actions. */
export async function insertParseLog(row: ParseLogInsert): Promise<string | null> {
  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase.from('parse_log').insert(row).select('id').single();
    if (error) throw error;
    return data.id as string;
  } catch {
    return null;
  }
}
