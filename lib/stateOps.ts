import { Client, DeliverableInput, QuickAddAction, StageKey, Task, TrackerState } from './types';
import { stageIndex, findService } from './catalogue';
import { today, uid } from './dates';

// Every mutation the app can make, as a small, self-contained instruction
// rather than a full-state snapshot. This is the single source of truth
// for "what a change means" — applyOp() runs identically on the client
// (for instant optimistic UI) and on the server (as the one and only way
// tracker_state is ever written). The server always starts from its own
// fresh read of Supabase and applies these on top of it; it never accepts
// a client-supplied full replacement. That's what makes "only update
// what's actually there" true structurally, not just by convention —
// there is no code path left that can overwrite an entity this operation
// doesn't name.
export type Operation =
  | { type: 'addTask'; id: string; title: string; clientId: string | null; date: string; recurrence?: Task['recurrence'] }
  | { type: 'toggleTask'; id: string; nextOccurrence?: { id: string; date: string } }
  | { type: 'deleteTask'; id: string }
  | { type: 'updateTask'; id: string; patch: Partial<Pick<Task, 'title' | 'date' | 'clientId' | 'important' | 'recurrence'>> }
  | { type: 'addClient'; id: string; name: string; phone: string }
  | { type: 'updateClient'; id: string; patch: Partial<Client> }
  | { type: 'deleteClient'; id: string }
  | { type: 'setStage'; id: string; stage: StageKey }
  | { type: 'addDeliverables'; clientId: string; items: (DeliverableInput & { id: string })[]; category?: string }
  | { type: 'toggleDeliverable'; clientId: string; deliverableId: string }
  | { type: 'deleteDeliverable'; clientId: string; deliverableId: string }
  | { type: 'applyQuickAddActions'; list: QuickAddAction[] };

function newClient(id: string, name: string, phone?: string | null): Client {
  return {
    id,
    name: name.trim(),
    phone: phone || '',
    stage: 'cold',
    quoteValue: '',
    advance: '',
    deliverables: [],
    notes: '',
    nextFollowUp: '',
    createdAt: today(),
    history: { cold: today() }
  };
}

// The quick-add reducer: interprets a parsed action list against whatever
// state it's handed (local for the optimistic run, the server's fresh
// read for the authoritative one) — same fuzzy client-matching/creation
// logic either way, just possibly landing on different generated ids for
// a brand-new client, which the caller reconciles after the round trip.
function applyQuickAddList(state: TrackerState, list: QuickAddAction[]): TrackerState {
  let clients: Client[] = [...state.clients];
  let tasks: Task[] = [...state.tasks];

  const find = (name: string | null | undefined): Client | null => {
    if (!name) return null;
    const n = String(name).toLowerCase().trim();
    return (
      clients.find((c) => c.name.toLowerCase() === n) ||
      clients.find((c) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase())) ||
      null
    );
  };
  const ensure = (name: string | null | undefined, phone?: string | null): Client => {
    const hit = find(name);
    if (hit) return hit;
    const c = newClient(uid(), String(name || 'Unnamed'), phone);
    clients = [...clients, c];
    return c;
  };
  const patch = (id: string, p: Partial<Client>) => {
    clients = clients.map((c) => (c.id === id ? { ...c, ...p } : c));
  };
  const get = (id: string) => clients.find((c) => c.id === id)!;

  (list || []).forEach((a) => {
    try {
      if (a.type === 'task' && a.title) {
        const c = a.clientName ? ensure(a.clientName) : null;
        tasks = [...tasks, { id: uid(), title: a.title, clientId: c ? c.id : null, date: a.date || today(), done: false }];
      } else if (a.type === 'client' && a.name) {
        ensure(a.name, a.phone);
      } else if (a.type === 'stage' && a.stage) {
        const c = ensure(a.clientName);
        const cur = get(c.id);
        patch(c.id, { stage: a.stage, history: { ...cur.history, [a.stage]: cur.history[a.stage] || today() } });
      } else if (a.type === 'money') {
        const c = ensure(a.clientName);
        const cur = get(c.id);
        const p: Partial<Client> = {};
        if (a.quoteValue != null) {
          p.quoteValue = String(a.quoteValue);
          if (stageIndex(cur.stage) < 4) {
            p.stage = 'quoted';
            p.history = { ...cur.history, quoted: cur.history.quoted || today() };
          }
        }
        if (a.advance != null) {
          p.advance = String(a.advance);
          if (Number(a.advance) > 0 && stageIndex(cur.stage) < 5) {
            p.stage = 'advance';
            p.history = { ...cur.history, ...(p.history || {}), advance: cur.history.advance || today() };
          }
        }
        patch(c.id, p);
      } else if (a.type === 'deliverable' && a.items) {
        const c = ensure(a.clientName);
        const cur = get(c.id);
        patch(c.id, { deliverables: [...cur.deliverables, ...a.items.map((t) => ({ id: uid(), text: t, done: false }))] });
      } else if (a.type === 'service' && a.service) {
        const svc = findService(a.service);
        if (svc) {
          const c = ensure(a.clientName);
          const cur = get(c.id);
          const existing = new Set(cur.deliverables.map((x) => x.text));
          const fresh = svc.steps.filter((s) => !existing.has(s));
          patch(c.id, { deliverables: [...cur.deliverables, ...fresh.map((t) => ({ id: uid(), text: t, done: false, category: svc.name }))] });
        }
      } else if (a.type === 'done') {
        const c = find(a.clientName);
        const m = String(a.match || '').toLowerCase();
        if (c && m) patch(c.id, { deliverables: c.deliverables.map((x) => (x.text.toLowerCase().includes(m) ? { ...x, done: true } : x)) });
      } else if (a.type === 'tick') {
        const m = String(a.match || '').toLowerCase();
        let hit = false;
        if (m) {
          tasks = tasks.map((t) => {
            if (!hit && !t.done && t.title.toLowerCase().includes(m)) {
              hit = true;
              return { ...t, done: true };
            }
            return t;
          });
        }
      } else if (a.type === 'followup' && a.date) {
        const c = ensure(a.clientName);
        patch(c.id, { nextFollowUp: a.date });
      }
    } catch (e) {
      // skip a malformed action, keep the rest
    }
  });

  return { clients, tasks };
}

/** Applies one operation to `state` and returns the new state. Pure — no
 * I/O, no randomness beyond what the operation itself already carries
 * (ids are pre-generated by the caller, not minted in here, so the same
 * operation produces the same shape wherever it runs). This is called
 * twice for most UI-driven edits — once client-side for instant feedback,
 * once server-side against Supabase's current row — and must stay the
 * only place either side is allowed to mutate a TrackerState. */
export function applyOp(state: TrackerState, op: Operation): TrackerState {
  switch (op.type) {
    case 'addTask':
      return {
        ...state,
        tasks: [...state.tasks, { id: op.id, title: op.title, clientId: op.clientId, date: op.date, done: false, recurrence: op.recurrence }]
      };

    case 'toggleTask': {
      const target = state.tasks.find((t) => t.id === op.id);
      const toggled = state.tasks.map((t) => (t.id === op.id ? { ...t, done: !t.done } : t));
      // Only spawns the next occurrence on the false->true transition (not
      // on un-completing one), and only when the caller supplied the next
      // id/date to use — same pre-generated-id convention as every other
      // operation here, so the client's optimistic apply and the server's
      // authoritative apply create the identical task.
      if (target && !target.done && target.recurrence && op.nextOccurrence) {
        return {
          ...state,
          tasks: [
            ...toggled,
            {
              id: op.nextOccurrence.id,
              title: target.title,
              clientId: target.clientId,
              date: op.nextOccurrence.date,
              done: false,
              recurrence: target.recurrence
            }
          ]
        };
      }
      return { ...state, tasks: toggled };
    }

    case 'deleteTask':
      return { ...state, tasks: state.tasks.filter((t) => t.id !== op.id) };

    case 'updateTask':
      return { ...state, tasks: state.tasks.map((t) => (t.id === op.id ? { ...t, ...op.patch } : t)) };

    case 'addClient':
      return { ...state, clients: [...state.clients, newClient(op.id, op.name, op.phone)] };

    case 'updateClient':
      return { ...state, clients: state.clients.map((c) => (c.id === op.id ? { ...c, ...op.patch } : c)) };

    case 'deleteClient':
      return { ...state, clients: state.clients.filter((c) => c.id !== op.id) };

    case 'setStage':
      return {
        ...state,
        clients: state.clients.map((c) =>
          c.id === op.id ? { ...c, stage: op.stage, history: { ...c.history, [op.stage]: c.history[op.stage] || today() } } : c
        )
      };

    case 'addDeliverables':
      return {
        ...state,
        clients: state.clients.map((c) =>
          c.id === op.clientId
            ? {
                ...c,
                deliverables: [
                  ...c.deliverables,
                  ...op.items.map((it) => ({ id: it.id, text: it.text, done: false, category: op.category, price: it.price, deadline: it.deadline }))
                ]
              }
            : c
        )
      };

    case 'toggleDeliverable':
      return {
        ...state,
        clients: state.clients.map((c) =>
          c.id === op.clientId
            ? { ...c, deliverables: c.deliverables.map((x) => (x.id === op.deliverableId ? { ...x, done: !x.done } : x)) }
            : c
        )
      };

    case 'deleteDeliverable':
      return {
        ...state,
        clients: state.clients.map((c) =>
          c.id === op.clientId ? { ...c, deliverables: c.deliverables.filter((x) => x.id !== op.deliverableId) } : c
        )
      };

    case 'applyQuickAddActions':
      return applyQuickAddList(state, op.list);

    default: {
      const _exhaustive: never = op;
      return state;
    }
  }
}
