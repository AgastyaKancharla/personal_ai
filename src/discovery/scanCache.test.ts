import assert from 'node:assert/strict';
import { clearScanCache, getCachedScan, setCachedScan } from './scanCache';

const source = { businessName: 'Cache Clinic', phone: '9876543210' };
const result = { directoryId: 'justdial', directoryName: 'Justdial', status: 'CONSISTENT' as const, diffs: [], overallConfidence: 100, claimStatus: 'UNKNOWN' as const, fromCache: false, as_of: new Date().toISOString() };
clearScanCache();
assert.equal(getCachedScan(source, 'justdial'), undefined);
setCachedScan(source, result);
assert.equal(getCachedScan(source, 'justdial')?.fromCache, true);
console.log('scan cache tests passed');
