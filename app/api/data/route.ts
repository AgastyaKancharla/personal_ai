import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, TRACKER_ROW_ID } from '@/lib/supabase';
import { TrackerState } from '@/lib/types';

export const runtime = 'nodejs';
// Without this, Next statically optimizes the route around the GET handler
// (it has no visible per-request dynamic API calls) and Vercel's edge then
// serves the path as a cached static asset — which rejects PUT with a 405
// before it ever reaches this file. Confirmed live: PUT /api/data 405,
// cache=HIT, on the very first production deploy.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from('tracker_state')
      .select('data, updated_at')
      .eq('id', TRACKER_ROW_ID)
      .maybeSingle();

    if (error) throw error;

    const state: TrackerState = data?.data ?? { clients: [], tasks: [] };
    return NextResponse.json({ state, updatedAt: data?.updated_at ?? null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load state.' }, { status: 500 });
  }
}

// Full-state replace. Deliberately NOT used for normal edits anymore —
// every add/edit/delete goes through POST /api/data/ops instead, which
// only ever touches the specific entity an operation names. This stays
// only for the one place a full replace is actually correct: the "Restore
// from a backup" flow in DataSheet.tsx, where the user explicitly pastes
// a full snapshot and asks for it to replace everything. If you're
// tempted to call this from anywhere else, don't — that's exactly the
// shape of bug that silently wiped a real client's data in production.
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as TrackerState;
    if (!Array.isArray(body?.clients) || !Array.isArray(body?.tasks)) {
      return NextResponse.json({ error: 'Body must include clients[] and tasks[].' }, { status: 400 });
    }

    const supabase = supabaseServer();
    const { error } = await supabase
      .from('tracker_state')
      .upsert({ id: TRACKER_ROW_ID, data: body, updated_at: new Date().toISOString() });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to save state.' }, { status: 500 });
  }
}
