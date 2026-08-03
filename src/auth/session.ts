import crypto from 'crypto';
import { CONFIG } from '../config/env';

export const SESSION_COOKIE = 'aone_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const sessionSecret = CONFIG.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!CONFIG.SESSION_SECRET && CONFIG.INTERNAL_APP_PASSWORD) {
  console.warn('SESSION_SECRET is not set; using a random secret for this process. Sessions will not survive a restart. Set SESSION_SECRET for stable sessions across deploys.');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createSessionToken(): string {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_TTL_MS });
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return false;
  if (!safeEqual(sign(encoded), signature)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as { exp: number };
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function checkPassword(candidate: string): boolean {
  if (!CONFIG.INTERNAL_APP_PASSWORD) return false;
  return safeEqual(candidate, CONFIG.INTERNAL_APP_PASSWORD);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}
