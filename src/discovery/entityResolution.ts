import { distance } from 'fastest-levenshtein';
import { doubleMetaphone } from './doubleMetaphone';
import { BusinessQuery, RawCandidate } from './types';

export interface ScoredMatch {
  candidate: RawCandidate;
  score: number;
  reasons: string[];
}

type Comparable = Pick<RawCandidate, 'name' | 'address' | 'phone' | 'website' | 'category' | 'ownerName' | 'lat' | 'lng'>;

export function normalizePhone(value?: string): string {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function normalizeDomain(value?: string): string {
  return (value || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, '').toLowerCase();
}

function normalizedText(value?: string): string {
  return (value || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function nameSimilarity(first?: string, second?: string): number {
  const a = normalizedText(first);
  const b = normalizedText(second);
  if (!a || !b) return 0;
  const levenshtein = 1 - distance(a, b) / Math.max(a.length, b.length);
  const [primaryA, alternateA] = doubleMetaphone(a);
  const [primaryB, alternateB] = doubleMetaphone(b);
  const phoneticMatch = [primaryA, alternateA].filter(Boolean).some((code) => code === primaryB || code === alternateB);
  return Math.max(levenshtein, phoneticMatch ? 0.82 : 0);
}

export function haversineDistanceMeters(first: Comparable, second: Comparable): number | undefined {
  if (first.lat === undefined || first.lng === undefined || second.lat === undefined || second.lng === undefined) return undefined;
  const radians = (value: number) => value * Math.PI / 180;
  const deltaLat = radians(second.lat - first.lat);
  const deltaLng = radians(second.lng - first.lng);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function categoriesConflict(first?: string, second?: string): boolean {
  const a = normalizedText(first);
  const b = normalizedText(second);
  if (!a || !b) return false;
  const medical = /dent|clinic|doctor|medical|hospital|health/.test(a) && /dent|clinic|doctor|medical|hospital|health/.test(b);
  const food = /restaurant|cafe|food|bakery/.test(a) && /restaurant|cafe|food|bakery/.test(b);
  return !medical && !food && !a.includes(b) && !b.includes(a);
}

function score(first: Comparable, second: Comparable, candidate: RawCandidate): ScoredMatch {
  if (categoriesConflict(first.category, second.category)) return { candidate, score: 0, reasons: ['categories are incompatible'] };
  const contributions: Array<{ value: number; reason: string }> = [];
  const phoneA = normalizePhone(first.phone);
  const phoneB = normalizePhone(second.phone);
  const phoneMatches = Boolean(phoneA && phoneB && phoneA === phoneB);
  if (phoneMatches) contributions.push({ value: 0.85, reason: 'phone matches exactly' });

  const meters = haversineDistanceMeters(first, second);
  if (meters !== undefined) {
    if (meters < 150) contributions.push({ value: 0.35, reason: `address ${Math.round(meters)}m away` });
    else if (meters <= 500) contributions.push({ value: 0.2, reason: `address ${Math.round(meters)}m away` });
    else contributions.push({ value: 0.02, reason: 'addresses are far apart' });
  }

  const domainA = normalizeDomain(first.website);
  const domainB = normalizeDomain(second.website);
  if (domainA && domainB && domainA === domainB) contributions.push({ value: 0.25, reason: 'website matches exactly' });

  const similarity = nameSimilarity(first.name, second.name);
  if (similarity >= 0.55) contributions.push({ value: Math.min(0.2, similarity * 0.2), reason: similarity >= 0.82 ? 'business name closely matches' : 'business name is similar' });

  const ownerSimilarity = nameSimilarity(first.ownerName, second.ownerName);
  if (ownerSimilarity >= 0.75) contributions.push({ value: 0.15, reason: 'owner name matches' });

  const summed = contributions.reduce((total, contribution) => total + contribution.value, 0);
  const score = Math.min(1, phoneMatches ? Math.max(0.85, summed) : summed);
  return { candidate, score, reasons: contributions.sort((a, b) => b.value - a.value).slice(0, 3).map((contribution) => contribution.reason) };
}

export function scoreAgainstQuery(candidate: RawCandidate, query: BusinessQuery): ScoredMatch {
  return score(candidate, query, candidate);
}

export function scoreAgainstCandidate(first: RawCandidate, second: RawCandidate): ScoredMatch {
  return score(first, second, second);
}
