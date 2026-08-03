import { DirectoryAuditStatus } from '../types/nap';

const outcomes = new Map<string, Array<'success' | 'not_found' | 'error'>>();
export const KNOWN_GOOD_REFERENCES: Record<string, string> = {
  google_business: 'Googleplex, Mountain View', justdial: 'Indian Coffee House, Bengaluru', practo: 'Manipal Hospitals, Bengaluru', lybrate: 'Apollo Hospitals, Bengaluru', sulekha: 'Urban Company, Bengaluru'
};

export function recordAdapterOutcome(directoryId: string, status: DirectoryAuditStatus): void {
  const outcome: 'success' | 'not_found' | 'error' = status === 'ERROR' ? 'error' : status === 'NOT_FOUND' ? 'not_found' : 'success';
  const history: Array<'success' | 'not_found' | 'error'> = [...(outcomes.get(directoryId) || []), outcome].slice(-5);
  outcomes.set(directoryId, history);
}

export function checkAdapterHealth(directoryId: string): boolean {
  const history = outcomes.get(directoryId) || [];
  return history.filter((outcome) => outcome === 'error').length <= 2;
}

export function getAdapterHealth(directoryId: string) {
  const history = outcomes.get(directoryId) || [];
  return { directoryId, reference: KNOWN_GOOD_REFERENCES[directoryId], recentOutcomes: history, healthy: checkAdapterHealth(directoryId) };
}
