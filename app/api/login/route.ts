import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, checkPassword, createSessionToken } from '@/lib/auth';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const appPassword = process.env.APP_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!appPassword || !sessionSecret) {
    return NextResponse.json({ error: 'Server is not configured (APP_PASSWORD/SESSION_SECRET missing).' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!password || !(await checkPassword(password, appPassword))) {
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
  }

  const token = await createSessionToken(sessionSecret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
  return res;
}
