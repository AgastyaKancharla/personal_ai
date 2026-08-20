import { SERVICES } from '../catalogue';
import { Span } from './types';

export interface ServiceMatch {
  service: string; // exact catalogue name
  span: Span;
}

// Longest phrases first so "google business profile" wins over "google
// profile" wins over the bare "gbp"/"gmb" initialisms.
const ALIASES: [string, string][] = [
  ['google business profile', 'Google Business Profile Optimization'],
  ['google profile', 'Google Business Profile Optimization'],
  ['gbp', 'Google Business Profile Optimization'],
  ['gmb', 'Google Business Profile Optimization'],
  ['ai receptionist', 'AI Appointment Booking Receptionist'],
  ['call bot', 'AI Appointment Booking Receptionist'],
  ['receptionist', 'AI Appointment Booking Receptionist'],
  ['whatsapp', 'WhatsApp Automation'],
  ['reviews', 'Review Automation'],
  ['recall', 'Patient Recall System'],
  ['website', 'Dental Website Development'],
  ['site', 'Dental Website Development']
];

export function matchService(text: string): ServiceMatch | null {
  const lower = text.toLowerCase();

  // Full catalogue names first (longest first, so a shorter name that's a
  // substring of a longer one never steals the match).
  const byLength = [...SERVICES].sort((a, b) => b.name.length - a.name.length);
  for (const s of byLength) {
    const idx = lower.indexOf(s.name.toLowerCase());
    if (idx !== -1) return { service: s.name, span: [idx, idx + s.name.length] };
  }

  for (const [alias, service] of ALIASES) {
    const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const m = re.exec(text);
    if (m) return { service, span: [m.index, m.index + m[0].length] };
  }

  return null;
}
