import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, TRACKER_ROW_ID } from '@/lib/supabase';
import { TrackerState } from '@/lib/types';

export const runtime = 'nodejs';

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
