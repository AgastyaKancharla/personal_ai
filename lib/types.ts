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
  // The service/service group this step came from (e.g. "Google Business
  // Profile Optimization"), so multiple services' checklists on one client
  // can render as separate groups instead of one undifferentiated list.
  // Undefined for ad-hoc items (typed one at a time, or pasted from a
  // quote with no per-line service attribution).
  category?: string;
  // What was promised for this specific line, when a quote doc or manual
  // entry says so — kept as a display string (e.g. "₹80,000"), same
  // convention as Client.quoteValue/advance, not a running total.
  price?: string;
  deadline?: string;
}

// Shape accepted by addDeliverables — text is required, price/deadline
// are only ever known when a source (a quote doc, a manual entry) says so.
export interface DeliverableInput {
  text: string;
  price?: string;
  deadline?: string;
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
