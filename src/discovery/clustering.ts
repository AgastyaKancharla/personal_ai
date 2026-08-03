import { haversineDistanceMeters, normalizePhone, scoreAgainstCandidate, scoreAgainstQuery } from './entityResolution';
import { BusinessQuery, RawCandidate } from './types';

export const CLUSTER_MATCH_THRESHOLD = 0.75;
export const PRIMARY_MATCH_THRESHOLD = 0.6;
export const MINIMUM_CONFIDENCE = 0.3;

export interface BusinessCluster {
  id: string;
  representative: RawCandidate;
  members: RawCandidate[];
  sources: string[];
  confidence: number;
  reasons: string[];
  status: 'PRIMARY_MATCH' | 'POSSIBLE_DUPLICATE_OR_OLD_LISTING';
}

class UnionFind {
  private readonly parents: number[];
  constructor(size: number) { this.parents = Array.from({ length: size }, (_, index) => index); }
  find(index: number): number { if (this.parents[index] !== index) this.parents[index] = this.find(this.parents[index]); return this.parents[index]; }
  union(first: number, second: number): void { const a = this.find(first); const b = this.find(second); if (a !== b) this.parents[b] = a; }
}

function preferredValue<T extends string | number>(members: RawCandidate[], key: keyof RawCandidate): T | undefined {
  const values = members.map((member) => member[key]).filter((value): value is T => value !== undefined && value !== '');
  if (!values.length) return undefined;
  const counts = new Map<T, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(b[0]).length - String(a[0]).length)[0][0];
}

function representative(members: RawCandidate[]): RawCandidate {
  const best = [...members].sort((a, b) => Object.values(b).filter(Boolean).length - Object.values(a).filter(Boolean).length)[0];
  return {
    ...best,
    name: preferredValue<string>(members, 'name'), address: preferredValue<string>(members, 'address'), phone: preferredValue<string>(members, 'phone'),
    website: preferredValue<string>(members, 'website'), category: preferredValue<string>(members, 'category'), ownerName: preferredValue<string>(members, 'ownerName'),
    lat: preferredValue<number>(members, 'lat'), lng: preferredValue<number>(members, 'lng')
  };
}

function sharesStrongSignal(first: RawCandidate, second: RawCandidate): boolean {
  const phoneA = normalizePhone(first.phone);
  const phoneB = normalizePhone(second.phone);
  const meters = haversineDistanceMeters(first, second);
  return Boolean(phoneA && phoneB && phoneA === phoneB) || (meters !== undefined && meters <= 500);
}

export function clusterCandidates(candidates: RawCandidate[], query: BusinessQuery): BusinessCluster[] {
  const groups = new UnionFind(candidates.length);
  for (let first = 0; first < candidates.length; first += 1) {
    for (let second = first + 1; second < candidates.length; second += 1) {
      if (scoreAgainstCandidate(candidates[first], candidates[second]).score >= CLUSTER_MATCH_THRESHOLD) groups.union(first, second);
    }
  }
  const byRoot = new Map<number, RawCandidate[]>();
  candidates.forEach((candidate, index) => {
    const root = groups.find(index);
    byRoot.set(root, [...(byRoot.get(root) || []), candidate]);
  });
  const clusters = [...byRoot.values()].map((members, index) => {
    const canonical = representative(members);
    const match = scoreAgainstQuery(canonical, query);
    return { id: `cluster-${index + 1}`, representative: canonical, members, sources: [...new Set(members.map((member) => member.source))], confidence: match.score, reasons: match.reasons, status: 'PRIMARY_MATCH' as const };
  }).filter((cluster) => cluster.confidence >= MINIMUM_CONFIDENCE).sort((a, b) => b.confidence - a.confidence);
  if (!clusters.length || clusters[0].confidence < PRIMARY_MATCH_THRESHOLD) return [];
  const primary = clusters[0];
  return clusters.map((cluster, index) => ({ ...cluster, status: index > 0 && sharesStrongSignal(cluster.representative, primary.representative) ? 'POSSIBLE_DUPLICATE_OR_OLD_LISTING' : 'PRIMARY_MATCH' }));
}
