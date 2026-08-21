import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, TRACKER_ROW_ID } from '@/lib/supabase';
import { TrackerState } from '@/lib/types';
import { Operation, applyOp } from '@/lib/stateOps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The only place tracker_state is ever written for a normal edit. Takes a
 * batch of small operations (add this task, delete that deliverable...),
 * reads the row fresh from Supabase, applies each one in order, and writes
 * the result back — all in this one request. There is no client-supplied
 * "here's the whole state, save this" path here: the starting point is
 * always whatever Supabase actually has right now, so a stale or
 * incomplete local snapshot can never overwrite an entity these operations
 * don't mention. This is what closes the class of bug that silently wiped
 * a real client (and, separately, a client edit) in production — both
 * traced back to the old design sending a full local copy on every save.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const operations: Operation[] = Array.isArray(body?.operations) ? body.operations : [];
    if (!operations.length) {
      return NextResponse.json({ error: 'No operations provided.' }, { status: 400 });
    }

    const supabase = supabaseServer();
    const { data, error: readError } = await supabase
      .from('tracker_state')
      .select('data')
      .eq('id', TRACKER_ROW_ID)
      .maybeSingle();
    if (readError) throw readError;

    let state: TrackerState = data?.data ?? { clients: [], tasks: [] };
    for (const op of operations) {
      state = applyOp(state, op);
    }

    const updatedAt = new Date().toISOString();
    const { error: writeError } = await supabase
      .from('tracker_state')
      .upsert({ id: TRACKER_ROW_ID, data: state, updated_at: updatedAt });
    if (writeError) throw writeError;

    return NextResponse.json({ state, updatedAt });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to save.' }, { status: 500 });
  }
}
