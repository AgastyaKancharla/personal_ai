import crypto from 'crypto';
import { CONFIG } from '../config/env';

function key(): Buffer { const value = Buffer.from(CONFIG.TOKEN_ENCRYPTION_KEY, 'hex'); if (value.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be a 32-byte hex key.'); return value; }
export function encrypt(value: unknown): string { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv); const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]); return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.'); }
export function decrypt<T>(value: string): T { const [iv, tag, payload] = value.split('.').map((part) => Buffer.from(part, 'base64')); const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv); decipher.setAuthTag(tag); return JSON.parse(Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8')) as T; }
