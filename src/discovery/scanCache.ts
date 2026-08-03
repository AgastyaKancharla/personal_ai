import { DirectoryAuditResult, SourceOfTruthNAP } from '../types/nap';
import { NAPNormalizer } from '../engine/normalizer';

export const SCAN_CACHE_FRESHNESS_MS = 36 * 60 * 60 * 1000;
const cache = new Map<string, DirectoryAuditResult>();

export function scanCacheKey(source: SourceOfTruthNAP, directoryId: string): string {
  const phone = NAPNormalizer.normalizePhone(source.phone || '');
  const identity = phone || `${NAPNormalizer.normalizeBusinessName(source.businessName || '')}|${NAPNormalizer.normalizeAddress(`${source.address || ''} ${source.city || ''}`)}`;
  return `${directoryId}:${identity}`;
}

export function getCachedScan(source: SourceOfTruthNAP, directoryId: string): DirectoryAuditResult | undefined {
  const result = cache.get(scanCacheKey(source, directoryId));
  if (!result || Date.now() - new Date(result.as_of).getTime() > SCAN_CACHE_FRESHNESS_MS) return undefined;
  return { ...result, fromCache: true };
}

export function setCachedScan(source: SourceOfTruthNAP, result: DirectoryAuditResult): void {
  cache.set(scanCacheKey(source, result.directoryId), { ...result, fromCache: false });
}

export function clearScanCache(): void { cache.clear(); }
