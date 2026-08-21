import { Client, DeliverableInput, QuickAddAction, StageKey, Task, TrackerState } from './types';
import { Operation, applyOp } from './stateOps';
import { nextRecurrenceDate, uid } from './dates';

export type SetState = (updater: (d: TrackerState) => TrackerState) => void;

export interface Actions {
  addTask: (title: string, clientId: string | null, date: string, recurrence?: Task['recurrence'], time?: string, tags?: string[]) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  updateTask: (id: string, patch: Partial<Pick<Task, 'title' | 'date' | 'clientId' | 'important' | 'recurrence' | 'time' | 'tags'>>) => void;
  addClient: (name: string, phone: string) => void;
  updateClient: (id: string, patch: Partial<Client>) => void;
  deleteClient: (id: string) => void;
  setStage: (id: string, stage: StageKey) => void;
  addDeliverables: (id: string, items: DeliverableInput[], category?: string) => void;
  toggleDeliverable: (clientId: string, deliverableId: string) => void;
  deleteDeliverable: (clientId: string, deliverableId: string) => void;
  openClient: (id: string) => void;
  applyActions: (list: QuickAddAction[]) => void;
}

/** Builds the UI-facing Actions object. Every method does two things: (1)
 * updates local state immediately via the same applyOp() the server uses,
 * for instant feedback, and (2) hands the operation to `enqueue`, which is
 * responsible for actually getting it to the server — see app/page.tsx's
 * ops queue. Nothing here ever ships a full TrackerState anywhere; only
 * these small, specific instructions do. */
export function makeActions(data: TrackerState, setData: SetState, openClientId: (id: string) => void, enqueue: (op: Operation) => void): Actions {
  const run = (op: Operation) => {
    setData((d) => applyOp(d, op));
    enqueue(op);
  };

  return {
    addTask: (title, clientId, date, recurrence, time, tags) => run({ type: 'addTask', id: uid(), title, clientId, date, recurrence, time, tags }),

    // Reads the pre-toggle task from the current render's `data` (not from
    // inside setData's updater — that can run more than once, e.g. under
    // React StrictMode, and minting a fresh next-occurrence id in there
    // would risk spawning two) so the next-occurrence id/date, if any, is
    // decided exactly once and carried in the single op sent both to the
    // optimistic local apply and to the server.
    toggleTask: (id) => {
      const t = data.tasks.find((x) => x.id === id);
      const op: Operation =
        t && !t.done && t.recurrence
          ? { type: 'toggleTask', id, nextOccurrence: { id: uid(), date: nextRecurrenceDate(t.date, t.recurrence.freq) } }
          : { type: 'toggleTask', id };
      run(op);
    },

    deleteTask: (id) => run({ type: 'deleteTask', id }),

    updateTask: (id, patch) => run({ type: 'updateTask', id, patch }),

    addClient: (name, phone) => run({ type: 'addClient', id: uid(), name, phone }),

    updateClient: (id, patch) => run({ type: 'updateClient', id, patch }),

    deleteClient: (id) => run({ type: 'deleteClient', id }),

    setStage: (id, stage) => run({ type: 'setStage', id, stage }),

    addDeliverables: (id, items, category) =>
      run({ type: 'addDeliverables', clientId: id, items: items.map((it) => ({ ...it, id: uid() })), category }),

    toggleDeliverable: (clientId, deliverableId) => run({ type: 'toggleDeliverable', clientId, deliverableId }),

    deleteDeliverable: (clientId, deliverableId) => run({ type: 'deleteDeliverable', clientId, deliverableId }),

    openClient: (id) => openClientId(id),

    applyActions: (list) => run({ type: 'applyQuickAddActions', list })
  };
}
