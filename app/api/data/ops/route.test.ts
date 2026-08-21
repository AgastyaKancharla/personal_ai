import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

// This route is the only place tracker_state is ever written for a normal
// edit (see the file's own doc comment) — the whole point is that it reads
// Supabase fresh and never accepts a client-supplied full state. The actual
// read-apply-write behavior needs live Supabase credentials this test
// environment doesn't have (same constraint as quick-add's provider tests);
// lib/stateOps.test.ts covers applyOp() itself, which is the part that
// matters for correctness. What's testable here without a database is the
// request-shape validation.
describe('POST /api/data/ops', () => {
  it('rejects a request with no operations', async () => {
    const req = new NextRequest('http://localhost/api/data/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects a request with an empty operations array', async () => {
    const req = new NextRequest('http://localhost/api/data/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: [] })
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('fails loudly rather than silently succeeding when Supabase is not configured', async () => {
    const req = new NextRequest('http://localhost/api/data/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: [{ type: 'toggleTask', id: 't1' }] })
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
