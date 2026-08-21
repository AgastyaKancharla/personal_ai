import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

// Request-shape only, same precedent as app/api/data/ops/route.test.ts and
// app/api/quick-add/route.test.ts — the actual model round trip needs a
// live BRAIN_API_URL this test environment doesn't have; what's testable
// without one is that the route validates input and fails loudly rather
// than silently when unconfigured.
describe('POST /api/chat', () => {
  const originalUrl = process.env.BRAIN_API_URL;
  const originalKey = process.env.BRAIN_API_KEY;

  beforeEach(() => {
    delete process.env.BRAIN_API_URL;
    delete process.env.BRAIN_API_KEY;
  });

  afterEach(() => {
    if (originalUrl !== undefined) process.env.BRAIN_API_URL = originalUrl;
    else delete process.env.BRAIN_API_URL;
    if (originalKey !== undefined) process.env.BRAIN_API_KEY = originalKey;
    else delete process.env.BRAIN_API_KEY;
  });

  it('rejects an empty message', async () => {
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' })
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects a missing message', async () => {
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('fails loudly rather than silently succeeding when BRAIN_API_URL/BRAIN_API_KEY are not configured', async () => {
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: "what's happening next week?" })
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
