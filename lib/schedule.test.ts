import { describe, expect, it } from 'vitest';
import { summarizeRange } from './schedule';
import { TrackerState } from './types';
import { mkClient } from './parse/testHelpers';

const stateWith = (state: Partial<TrackerState>): TrackerState => ({ clients: [], tasks: [], ...state });
const TODAY = '2026-08-19';

describe('summarizeRange', () => {
  it('includes only tasks within the inclusive start/end boundary', () => {
    const state = stateWith({
      tasks: [
        { id: 't1', title: 'Before range', clientId: null, date: '2026-08-16', done: false },
        { id: 't2', title: 'Start boundary', clientId: null, date: '2026-08-17', done: false },
        { id: 't3', title: 'Mid range', clientId: null, date: '2026-08-20', done: false },
        { id: 't4', title: 'End boundary', clientId: null, date: '2026-08-23', done: false },
        { id: 't5', title: 'After range', clientId: null, date: '2026-08-24', done: false }
      ]
    });
    const summary = summarizeRange(state, '2026-08-17', '2026-08-23', TODAY);
    expect(summary.tasks.map((t) => t.id)).toEqual(['t2', 't3', 't4']);
    expect(summary.totalCount).toBe(3);
  });

  it('resolves clientName for linked tasks and leaves it null for unlinked ones', () => {
    const client = mkClient('Bright Smile Dental Clinic');
    const state = stateWith({
      clients: [client],
      tasks: [
        { id: 't1', title: 'Linked', clientId: client.id, date: '2026-08-20', done: false },
        { id: 't2', title: 'Unlinked', clientId: null, date: '2026-08-20', done: false }
      ]
    });
    const summary = summarizeRange(state, '2026-08-17', '2026-08-23', TODAY);
    expect(summary.tasks.find((t) => t.id === 't1')!.clientName).toBe('Bright Smile Dental Clinic');
    expect(summary.tasks.find((t) => t.id === 't2')!.clientName).toBeNull();
  });

  it('flags overdue tasks as a subset of in-range tasks — not done, date before todayIso', () => {
    const state = stateWith({
      tasks: [
        { id: 't1', title: 'Overdue', clientId: null, date: '2026-08-17', done: false },
        { id: 't2', title: 'Overdue but done', clientId: null, date: '2026-08-17', done: true },
        { id: 't3', title: 'Today, not overdue', clientId: null, date: '2026-08-19', done: false }
      ]
    });
    const summary = summarizeRange(state, '2026-08-17', '2026-08-23', TODAY);
    expect(summary.overdueTasks.map((t) => t.id)).toEqual(['t1']);
    expect(summary.overdueCount).toBe(1);
  });

  it('a fully future range never has overdue tasks', () => {
    const state = stateWith({ tasks: [{ id: 't1', title: 'Next week', clientId: null, date: '2026-08-25', done: false }] });
    const summary = summarizeRange(state, '2026-08-24', '2026-08-30', TODAY);
    expect(summary.overdueTasks).toEqual([]);
    expect(summary.overdueCount).toBe(0);
  });

  it('doneCount counts only done tasks within range', () => {
    const state = stateWith({
      tasks: [
        { id: 't1', title: 'A', clientId: null, date: '2026-08-20', done: true },
        { id: 't2', title: 'B', clientId: null, date: '2026-08-20', done: false }
      ]
    });
    const summary = summarizeRange(state, '2026-08-17', '2026-08-23', TODAY);
    expect(summary.doneCount).toBe(1);
  });

  it('followUpsDue includes a client whose nextFollowUp is on or before the range end, excluding delivered clients', () => {
    const due = mkClient('Due Client', 'interested');
    due.nextFollowUp = '2026-08-20';
    const delivered = mkClient('Delivered Client', 'delivered');
    delivered.nextFollowUp = '2026-08-20';
    const notYetDue = mkClient('Future Client', 'interested');
    notYetDue.nextFollowUp = '2026-08-25';

    const state = stateWith({ clients: [due, delivered, notYetDue] });
    const summary = summarizeRange(state, '2026-08-17', '2026-08-23', TODAY);
    expect(summary.followUpsDue.map((f) => f.clientId)).toEqual([due.id]);
  });

  it('returns an empty summary for an empty state', () => {
    const summary = summarizeRange(stateWith({}), '2026-08-17', '2026-08-23', TODAY);
    expect(summary.tasks).toEqual([]);
    expect(summary.totalCount).toBe(0);
    expect(summary.doneCount).toBe(0);
    expect(summary.overdueTasks).toEqual([]);
    expect(summary.followUpsDue).toEqual([]);
  });
});
