import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TrackerState } from './types';

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

// Same read-fresh/write-back pair app/api/data/ops/route.ts implements
// inline — factored out here so other server-only callers (the chat tools
// executor) can reuse the exact same pattern instead of duplicating raw
// Supabase calls. app/api/data/ops/route.ts is left as-is (already shipped
// and tested; no reason to touch a working file for this).
export async function readTrackerState(supabase: SupabaseClient): Promise<TrackerState> {
  const { data, error } = await supabase.from('tracker_state').select('data').eq('id', TRACKER_ROW_ID).maybeSingle();
  if (error) throw error;
  return data?.data ?? { clients: [], tasks: [] };
}

export async function writeTrackerState(supabase: SupabaseClient, state: TrackerState): Promise<void> {
  const { error } = await supabase.from('tracker_state').upsert({ id: TRACKER_ROW_ID, data: state, updated_at: new Date().toISOString() });
  if (error) throw error;
}

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
