import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

// Regression test for a bug that shipped silently: a zero-action parse with
// no ANTHROPIC_API_KEY configured returned HTTP 422 instead of the
// low-confidence rules result, contradicting "the app works end to end with
// no key set" — and nothing caught it, because no test exercised this route
// at all. insertParseLog degrades to logId: null without live Supabase
// credentials rather than throwing, so this is fully testable without a
// database.
describe('POST /api/quick-add', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('returns 200 with the rules result (not 422) when nothing recognizable is found and no provider is configured', async () => {
    const req = new NextRequest('http://localhost/api/quick-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'asdkj qwoeiu random text about nothing at all', clients: [] })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.actions).toEqual([]);
    expect(body.summary).toBe('Nothing recognized');
    expect('logId' in body).toBe(true);
  });

  it('still returns 200 with real actions when the rules engine is confident, with no provider configured', async () => {
    const req = new NextRequest('http://localhost/api/quick-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Verma Dental paid 25k advance', clients: [{ id: 'v', name: 'Verma Dental', phone: '', stage: 'quoted', quoteValue: '', advance: '', deliverables: [], notes: '', nextFollowUp: '', createdAt: '2026-01-01', history: {} }] })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.actions).toEqual([{ type: 'money', clientName: 'Verma Dental', quoteValue: null, advance: 25000 }]);
  });
});
