import { describe, expect, it } from 'vitest';
import { applyOp, Operation } from './stateOps';
import { TrackerState } from './types';
import { mkClient } from './parse/testHelpers';

const stateWith = (state: Partial<TrackerState>): TrackerState => ({ clients: [], tasks: [], ...state });

describe('applyOp — the only place a TrackerState is ever mutated', () => {
  it('addTask appends without touching existing tasks', () => {
    const before = stateWith({ tasks: [{ id: 't1', title: 'Existing', clientId: null, date: '2026-08-20', done: false }] });
    const op: Operation = { type: 'addTask', id: 't2', title: 'New', clientId: null, date: '2026-08-21' };
    const after = applyOp(before, op);
    expect(after.tasks).toHaveLength(2);
    expect(after.tasks[0]).toEqual(before.tasks[0]);
  });

  it('toggleTask flips only the named task', () => {
    const before = stateWith({
      tasks: [
        { id: 't1', title: 'A', clientId: null, date: '2026-08-20', done: false },
        { id: 't2', title: 'B', clientId: null, date: '2026-08-20', done: false }
      ]
    });
    const after = applyOp(before, { type: 'toggleTask', id: 't2' });
    expect(after.tasks.find((t) => t.id === 't1')!.done).toBe(false);
    expect(after.tasks.find((t) => t.id === 't2')!.done).toBe(true);
  });

  it('updateTask patches only the named task, leaving others byte-identical', () => {
    const before = stateWith({
      tasks: [
        { id: 't1', title: 'A', clientId: null, date: '2026-08-20', done: false },
        { id: 't2', title: 'B', clientId: null, date: '2026-08-20', done: false }
      ]
    });
    const after = applyOp(before, { type: 'updateTask', id: 't1', patch: { title: 'A, renamed', date: '2026-08-25' } });
    expect(after.tasks.find((t) => t.id === 't1')).toEqual({ id: 't1', title: 'A, renamed', clientId: null, date: '2026-08-25', done: false });
    expect(after.tasks.find((t) => t.id === 't2')).toEqual(before.tasks[1]);
  });

  it('updateTask can patch the important flag alone, without touching other fields', () => {
    const before = stateWith({
      tasks: [
        { id: 't1', title: 'A', clientId: null, date: '2026-08-20', done: false },
        { id: 't2', title: 'B', clientId: null, date: '2026-08-20', done: false }
      ]
    });
    const after = applyOp(before, { type: 'updateTask', id: 't1', patch: { important: true } });
    expect(after.tasks.find((t) => t.id === 't1')).toEqual({ id: 't1', title: 'A', clientId: null, date: '2026-08-20', done: false, important: true });
    expect(after.tasks.find((t) => t.id === 't2')).toEqual(before.tasks[1]);
  });

  it('deleteClient removes only the named client — this is the exact bug that shipped: a one-tap delete with no other safeguard wiped a real client', () => {
    const a = mkClient('Client A');
    const b = mkClient('Client B');
    const before = stateWith({ clients: [a, b] });
    const after = applyOp(before, { type: 'deleteClient', id: a.id });
    expect(after.clients).toHaveLength(1);
    expect(after.clients[0].id).toBe(b.id);
  });

  it('updateClient patches only the named client, leaving others byte-identical', () => {
    const a = mkClient('Client A');
    const b = mkClient('Client B');
    const before = stateWith({ clients: [a, b] });
    const after = applyOp(before, { type: 'updateClient', id: a.id, patch: { notes: 'called them' } });
    expect(after.clients.find((c) => c.id === a.id)!.notes).toBe('called them');
    expect(after.clients.find((c) => c.id === b.id)).toEqual(b);
  });

  it('setStage updates stage and records first-entry history without touching other clients', () => {
    const a = mkClient('Client A', 'cold');
    const b = mkClient('Client B', 'cold');
    const before = stateWith({ clients: [a, b] });
    const after = applyOp(before, { type: 'setStage', id: a.id, stage: 'interested' });
    const updated = after.clients.find((c) => c.id === a.id)!;
    expect(updated.stage).toBe('interested');
    expect(updated.history.interested).toBeTruthy();
    expect(after.clients.find((c) => c.id === b.id)).toEqual(b);
  });

  it('addDeliverables appends to the named client only, carrying category/price/deadline through', () => {
    const a = mkClient('Client A');
    const b = mkClient('Client B');
    const before = stateWith({ clients: [a, b] });
    const after = applyOp(before, {
      type: 'addDeliverables',
      clientId: a.id,
      items: [{ id: 'd1', text: 'Design mockup', price: '₹20,000', deadline: 'within 2 weeks' }],
      category: 'Website Development'
    });
    const updated = after.clients.find((c) => c.id === a.id)!;
    expect(updated.deliverables).toEqual([
      { id: 'd1', text: 'Design mockup', done: false, category: 'Website Development', price: '₹20,000', deadline: 'within 2 weeks' }
    ]);
    expect(after.clients.find((c) => c.id === b.id)!.deliverables).toEqual([]);
  });

  it('toggleDeliverable and deleteDeliverable only affect the named item', () => {
    const a = mkClient('Client A');
    a.deliverables = [
      { id: 'd1', text: 'One', done: false },
      { id: 'd2', text: 'Two', done: false }
    ];
    let state = stateWith({ clients: [a] });
    state = applyOp(state, { type: 'toggleDeliverable', clientId: a.id, deliverableId: 'd1' });
    expect(state.clients[0].deliverables.map((d) => d.done)).toEqual([true, false]);

    state = applyOp(state, { type: 'deleteDeliverable', clientId: a.id, deliverableId: 'd2' });
    expect(state.clients[0].deliverables.map((d) => d.id)).toEqual(['d1']);
  });

  it('applyQuickAddActions reuses an existing client by name instead of creating a duplicate', () => {
    const a = mkClient('Verma Dental');
    const before = stateWith({ clients: [a] });
    const after = applyOp(before, {
      type: 'applyQuickAddActions',
      list: [{ type: 'stage', clientName: 'Verma Dental', stage: 'interested' }]
    });
    expect(after.clients).toHaveLength(1);
    expect(after.clients[0].id).toBe(a.id);
    expect(after.clients[0].stage).toBe('interested');
  });

  it('applyQuickAddActions creates a new client when the name is unknown, without touching existing ones', () => {
    const a = mkClient('Verma Dental');
    const before = stateWith({ clients: [a] });
    const after = applyOp(before, {
      type: 'applyQuickAddActions',
      list: [{ type: 'client', name: 'Banglore Dental', phone: null }]
    });
    expect(after.clients).toHaveLength(2);
    expect(after.clients.find((c) => c.id === a.id)).toEqual(a);
    expect(after.clients.some((c) => c.name === 'Banglore Dental')).toBe(true);
  });

  it('a sequence of operations composes the same way it would across separate requests', () => {
    let state = stateWith({});
    const ops: Operation[] = [
      { type: 'addClient', id: 'c1', name: 'New Client', phone: '' },
      { type: 'setStage', id: 'c1', stage: 'interested' },
      { type: 'addTask', id: 't1', title: 'Follow up', clientId: 'c1', date: '2026-08-25' }
    ];
    for (const op of ops) state = applyOp(state, op);
    expect(state.clients).toHaveLength(1);
    expect(state.clients[0].stage).toBe('interested');
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].clientId).toBe('c1');
  });
});
