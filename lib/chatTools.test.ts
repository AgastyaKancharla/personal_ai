import { describe, expect, it } from 'vitest';
import { buildAddTaskOp, buildUpdateClientOps, getSchedule, rangeForPeriod } from './chatTools';
import { TrackerState } from './types';
import { mkClient } from './parse/testHelpers';

describe('rangeForPeriod', () => {
  it('returns a distinct range for each recognized period', () => {
    const periods = ['today', 'this_week', 'next_week', 'this_month'] as const;
    const ranges = periods.map(rangeForPeriod);
    // Every range should at least have valid ISO bounds and be internally ordered.
    for (const r of ranges) expect(r.startIso <= r.endIso).toBe(true);
    // this_week and next_week must not be the same range.
    expect(ranges[1]).not.toEqual(ranges[2]);
  });
});

describe('getSchedule', () => {
  it('summarizes the given period against real state', () => {
    const client = mkClient('Verma Dental');
    const state: TrackerState = { clients: [client], tasks: [{ id: 't1', title: 'Task', clientId: client.id, date: rangeForPeriod('today').startIso, done: false }] };
    const summary = getSchedule(state, 'today');
    expect(summary.totalCount).toBe(1);
    expect(summary.tasks[0].clientName).toBe('Verma Dental');
  });
});

describe('buildAddTaskOp', () => {
  it('links the task when the client name resolves exactly', () => {
    const client = mkClient('Bright Smile Dental Clinic');
    const { op, note } = buildAddTaskOp([client], { title: 'Call them', date: '2026-08-25', clientName: 'Bright Smile Dental Clinic' });
    expect(op).toEqual({ type: 'addTask', id: expect.any(String), title: 'Call them', clientId: client.id, date: '2026-08-25' });
    expect(note).toContain('Bright Smile Dental Clinic');
  });

  it('links the task on a fuzzy match', () => {
    const client = mkClient('Bright Smile Dental Clinic');
    const { op } = buildAddTaskOp([client], { title: 'Call them', date: '2026-08-25', clientName: 'bright smile' });
    expect(op.type).toBe('addTask');
    expect((op as any).clientId).toBe(client.id);
  });

  it('still adds the task, unlinked, when the client name is ambiguous or unrecognized — never guesses', () => {
    const sharma1 = mkClient('Sharma Clinic');
    const sharma2 = mkClient('Sharma Dental');
    const { op, note } = buildAddTaskOp([sharma1, sharma2], { title: 'Follow up', date: '2026-08-25', clientName: 'sharma' });
    expect(op).toEqual({ type: 'addTask', id: expect.any(String), title: 'Follow up', clientId: null, date: '2026-08-25' });
    expect(note).toContain("couldn't confidently match");
  });

  it('adds an unlinked task when no client name is given at all', () => {
    const { op, note } = buildAddTaskOp([], { title: 'Personal errand', date: '2026-08-25' });
    expect((op as any).clientId).toBeNull();
    expect(note).toBe('Added "Personal errand" for 2026-08-25.');
  });
});

describe('buildUpdateClientOps', () => {
  it('emits a setStage operation, kept separate from the updateClient patch', () => {
    const client = mkClient('Verma Dental', 'cold');
    const { ok, ops, note } = buildUpdateClientOps([client], { clientName: 'Verma Dental', stage: 'interested' });
    expect(ok).toBe(true);
    expect(ops).toEqual([{ type: 'setStage', id: client.id, stage: 'interested' }]);
    expect(note).toContain('stage → interested');
  });

  it('emits an updateClient operation for money/notes/follow-up fields', () => {
    const client = mkClient('Verma Dental');
    const { ops } = buildUpdateClientOps([client], { clientName: 'Verma Dental', quoteValue: 50000, advance: 10000, notes: 'called', nextFollowUp: '2026-09-01' });
    expect(ops).toEqual([
      { type: 'updateClient', id: client.id, patch: { quoteValue: '50000', advance: '10000', notes: 'called', nextFollowUp: '2026-09-01' } }
    ]);
  });

  it('combines a stage change and other field changes into two ops', () => {
    const client = mkClient('Verma Dental', 'cold');
    const { ops } = buildUpdateClientOps([client], { clientName: 'Verma Dental', stage: 'quoted', quoteValue: 50000 });
    expect(ops).toEqual([
      { type: 'setStage', id: client.id, stage: 'quoted' },
      { type: 'updateClient', id: client.id, patch: { quoteValue: '50000' } }
    ]);
  });

  it('blocks — produces zero operations — when the client name is ambiguous, never guessing which real client to mutate', () => {
    const sharma1 = mkClient('Sharma Clinic');
    const sharma2 = mkClient('Sharma Dental');
    const { ok, ops, note } = buildUpdateClientOps([sharma1, sharma2], { clientName: 'sharma', stage: 'interested' });
    expect(ok).toBe(false);
    expect(ops).toEqual([]);
    expect(note).toContain("Couldn't confidently match");
  });

  it('blocks — produces zero operations — when the client name does not resolve at all', () => {
    const { ok, ops } = buildUpdateClientOps([], { clientName: 'Nobody Dental', stage: 'interested' });
    expect(ok).toBe(false);
    expect(ops).toEqual([]);
  });

  it('reports ok:false with no ops when a real client matches but nothing to update was given', () => {
    const client = mkClient('Verma Dental');
    const { ok, ops, note } = buildUpdateClientOps([client], { clientName: 'Verma Dental' });
    expect(ok).toBe(false);
    expect(ops).toEqual([]);
    expect(note).toContain('nothing to update');
  });
});
