import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (typeof body?.accepted !== 'boolean') {
    return NextResponse.json({ error: 'accepted (boolean) is required.' }, { status: 400 });
  }

  const patch: { accepted: boolean; corrected?: unknown } = { accepted: body.accepted };
  if (body.corrected !== undefined) patch.corrected = body.corrected;

  try {
    const supabase = supabaseServer();
    const { error } = await supabase.from('parse_log').update(patch).eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to save correction.' }, { status: 500 });
  }
}
