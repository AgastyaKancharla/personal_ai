export type StageKey =
  | 'cold'
  | 'interested'
  | 'meeting'
  | 'finalised'
  | 'quoted'
  | 'advance'
  | 'building'
  | 'delivered';

export interface Deliverable {
  id: string;
  text: string;
  done: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  stage: StageKey;
  quoteValue: string;
  advance: string;
  deliverables: Deliverable[];
  notes: string;
  nextFollowUp: string;
  createdAt: string;
  history: Partial<Record<StageKey, string>>;
}

export interface Task {
  id: string;
  title: string;
  clientId: string | null;
  date: string;
  done: boolean;
}

export interface TrackerState {
  clients: Client[];
  tasks: Task[];
}

export type QuickAddAction =
  | { type: 'task'; title: string; clientName: string | null; date: string }
  | { type: 'client'; name: string; phone: string | null }
  | { type: 'stage'; clientName: string; stage: StageKey }
  | { type: 'money'; clientName: string; quoteValue: number | null; advance: number | null }
  | { type: 'deliverable'; clientName: string; items: string[] }
  | { type: 'service'; clientName: string; service: string }
  | { type: 'done'; clientName: string; match: string }
  | { type: 'tick'; match: string }
  | { type: 'followup'; clientName: string; date: string };

// Shared contract name used by the rules/API parse engines (lib/parse/) and
// by training-data export — same shape as QuickAddAction, kept as one alias
// so app code, engine code and logged training data never drift apart.
export type Action = QuickAddAction;
