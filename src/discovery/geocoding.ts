import { CONFIG } from '../config/env';
import { BusinessQuery, RawCandidate } from './types';

let nextRequestAt = 0;
const cache = new Map<string, { lat: number; lng: number }>();

async function geocode(address?: string): Promise<{ lat: number; lng: number } | undefined> {
  const query = address?.trim();
  if (!query) return undefined;
  const cached = cache.get(query.toLowerCase());
  if (cached) return cached;
  const wait = Math.max(0, nextRequestAt - Date.now());
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  nextRequestAt = Date.now() + 1100;
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' })}`, {
    headers: { Accept: 'application/json', 'User-Agent': CONFIG.OSM_USER_AGENT }, signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) return undefined;
  const results = await response.json() as Array<{ lat?: string; lon?: string }>;
  const result = results[0];
  if (!result?.lat || !result.lon) return undefined;
  const coordinates = { lat: Number(result.lat), lng: Number(result.lon) };
  cache.set(query.toLowerCase(), coordinates);
  return coordinates;
}

export async function enrichCandidateCoordinates(candidate: RawCandidate): Promise<RawCandidate> {
  if (candidate.lat !== undefined && candidate.lng !== undefined) return candidate;
  const coordinates = await geocode(candidate.address);
  return coordinates ? { ...candidate, ...coordinates } : candidate;
}

export async function enrichQueryCoordinates(query: BusinessQuery): Promise<BusinessQuery> {
  if (query.lat !== undefined && query.lng !== undefined) return query;
  const coordinates = await geocode([query.address, query.city, query.pin].filter(Boolean).join(', '));
  return coordinates ? { ...query, ...coordinates } : query;
}
