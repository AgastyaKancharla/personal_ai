import { Client, QuickAddAction, StageKey, Task, TrackerState } from './types';
import { stageIndex } from './catalogue';
import { findService } from './catalogue';
import { today, uid } from './dates';

export type SetState = (updater: (d: TrackerState) => TrackerState) => void;

export interface Actions {
  addTask: (title: string, clientId: string | null, date: string) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  addClient: (name: string, phone: string) => void;
  updateClient: (id: string, patch: Partial<Client>) => void;
  deleteClient: (id: string) => void;
  setStage: (id: string, stage: StageKey) => void;
  addDeliverables: (id: string, texts: string[], category?: string) => void;
  toggleDeliverable: (clientId: string, deliverableId: string) => void;
  deleteDeliverable: (clientId: string, deliverableId: string) => void;
  openClient: (id: string) => void;
  applyActions: (list: QuickAddAction[]) => void;
}

function newClient(name: string, phone?: string | null): Client {
  return {
    id: uid(),
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

export function makeActions(setData: SetState, openClientId: (id: string) => void): Actions {
  return {
    addTask: (title, clientId, date) =>
      setData((d) => ({ ...d, tasks: [...d.tasks, { id: uid(), title, clientId, date, done: false }] })),

    toggleTask: (id) =>
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),

    deleteTask: (id) => setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) })),

    addClient: (name, phone) => setData((d) => ({ ...d, clients: [...d.clients, newClient(name, phone)] })),

    updateClient: (id, patch) =>
      setData((d) => ({ ...d, clients: d.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),

    deleteClient: (id) => setData((d) => ({ ...d, clients: d.clients.filter((c) => c.id !== id) })),

    setStage: (id, stage) =>
      setData((d) => ({
        ...d,
        clients: d.clients.map((c) =>
          c.id === id ? { ...c, stage, history: { ...c.history, [stage]: c.history[stage] || today() } } : c
        )
      })),

    addDeliverables: (id, texts, category) =>
      setData((d) => ({
        ...d,
        clients: d.clients.map((c) =>
          c.id === id
            ? { ...c, deliverables: [...c.deliverables, ...texts.map((t) => ({ id: uid(), text: t, done: false, category }))] }
            : c
        )
      })),

    toggleDeliverable: (clientId, deliverableId) =>
      setData((d) => ({
        ...d,
        clients: d.clients.map((c) =>
          c.id === clientId
            ? { ...c, deliverables: c.deliverables.map((x) => (x.id === deliverableId ? { ...x, done: !x.done } : x)) }
            : c
        )
      })),

    deleteDeliverable: (clientId, deliverableId) =>
      setData((d) => ({
        ...d,
        clients: d.clients.map((c) =>
          c.id === clientId ? { ...c, deliverables: c.deliverables.filter((x) => x.id !== deliverableId) } : c
        )
      })),

    openClient: (id) => openClientId(id),

    applyActions: (list) =>
      setData((d) => {
        let clients: Client[] = [...d.clients];
        let tasks: Task[] = [...d.tasks];

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
          const c = newClient(String(name || 'Unnamed'), phone);
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
      })
  };
}
