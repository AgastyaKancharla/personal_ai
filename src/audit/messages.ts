import { DirectoryAuditResult } from '../types/nap';

export function statusMessageFor(event: { type: 'start' | 'cache' | 'done'; directoryName: string; result?: DirectoryAuditResult }): string {
  if (event.type === 'cache') return `${event.directoryName} — using recent data.`;
  if (event.type === 'start') return `Checking ${event.directoryName}...`;
  const issues = event.result?.diffs.filter((diff) => diff.matchStatus !== 'EXACT').length || 0;
  return issues ? `${event.directoryName}: ${issues} issue${issues === 1 ? '' : 's'} found.` : `${event.directoryName}: details look consistent.`;
}
