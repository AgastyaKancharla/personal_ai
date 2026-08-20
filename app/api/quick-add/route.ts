import { NextRequest, NextResponse } from 'next/server';
import { parse } from '@/lib/parse';
import { getProvider } from '@/lib/parse/providers';
import { insertParseLog } from '@/lib/supabase';
import { Client } from '@/lib/types';
import { today } from '@/lib/dates';

export const runtime = 'nodejs';

const CONFIDENCE_THRESHOLD = 0.6;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  const clients: Client[] = Array.isArray(body?.clients) ? body.clients : [];

  if (!note) {
    return NextResponse.json({ error: 'Empty note.' }, { status: 400 });
  }

  const ctx = { clients, today: today() };
  const rulesResult = parse(note, ctx);

  // Confident enough on its own -> no network call, no cost.
  if (rulesResult.confidence >= CONFIDENCE_THRESHOLD) {
    const logId = await insertParseLog({
      raw_text: note,
      engine: 'rules',
      output: rulesResult.actions,
      confidence: rulesResult.confidence
    });
    return NextResponse.json({ actions: rulesResult.actions, summary: rulesResult.summary, logId });
  }

  // Below threshold: fall back to the API provider only if one is
  // configured. Its failure still falls back to the rules result rather
  // than erroring the whole request.
  const provider = getProvider();
  if (provider) {
    try {
      const apiResult = await provider.parse(note, ctx);
      const logId = await insertParseLog({
        raw_text: note,
        engine: 'api',
        output: apiResult.actions,
        confidence: apiResult.confidence
      });
      return NextResponse.json({ actions: apiResult.actions, summary: apiResult.summary, logId });
    } catch {
      // fall through to the rules result below
    }
  }

  // No provider, or it failed — hand back the rules result as-is, low
  // confidence (or zero actions) included, rather than failing the request.
  // buildSummary() already returns 'Nothing recognized' for an empty action
  // list, and the correction UI's "Not right" control needs a real logId on
  // a successful response to be reachable at all.
  const logId = await insertParseLog({
    raw_text: note,
    engine: 'rules',
    output: rulesResult.actions,
    confidence: rulesResult.confidence
  });

  return NextResponse.json({ actions: rulesResult.actions, summary: rulesResult.summary, logId });
}
