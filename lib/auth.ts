// Edge-safe session signing (Web Crypto only — no `node:crypto`), so this
// works identically in middleware.ts (edge runtime) and in API routes.

export const SESSION_COOKIE = 'pai_session';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toHex(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret: string): Promise<string> {
  const expires = String(Date.now() + TTL_MS);
  const sig = await hmac(secret, expires);
  return `${expires}.${sig}`;
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const [expires, sig] = token.split('.');
  if (!expires || !sig) return false;
  if (Number(expires) < Date.now()) return false;
  const expected = await hmac(secret, expires);
  return timingSafeEqual(sig, expected);
}

export async function checkPassword(input: string, secret: string): Promise<boolean> {
  // Password itself doesn't need HMAC verification against stored secret directly —
  // compare in constant time against the configured APP_PASSWORD instead.
  return timingSafeEqual(input, secret);
}
