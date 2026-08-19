import { Client, StageKey } from '../types';

export function mkClient(name: string, stage: StageKey = 'cold'): Client {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    phone: '',
    stage,
    quoteValue: '',
    advance: '',
    deliverables: [],
    notes: '',
    nextFollowUp: '',
    createdAt: '2026-01-01',
    history: { [stage]: '2026-01-01' }
  };
}
