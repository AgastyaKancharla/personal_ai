import { Client, DeliverableInput, QuickAddAction, StageKey, TrackerState } from './types';
import { Operation, applyOp } from './stateOps';
import { uid } from './dates';

export type SetState = (updater: (d: TrackerState) => TrackerState) => void;

export interface Actions {
  addTask: (title: string, clientId: string | null, date: string) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
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
export function makeActions(setData: SetState, openClientId: (id: string) => void, enqueue: (op: Operation) => void): Actions {
  const run = (op: Operation) => {
    setData((d) => applyOp(d, op));
    enqueue(op);
  };

  return {
    addTask: (title, clientId, date) => run({ type: 'addTask', id: uid(), title, clientId, date }),

    toggleTask: (id) => run({ type: 'toggleTask', id }),

    deleteTask: (id) => run({ type: 'deleteTask', id }),

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
