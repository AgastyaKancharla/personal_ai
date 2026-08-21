import { describe, expect, it } from 'vitest';
import { searchAll } from './search';
import { TrackerState } from './types';
import { mkClient } from './parse/testHelpers';

const stateWith = (state: Partial<TrackerState>): TrackerState => ({ clients: [], tasks: [], ...state });

describe('searchAll', () => {
  it('returns nothing for an empty query', () => {
    const state = stateWith({ tasks: [{ id: 't1', title: 'Buy milk', clientId: null, date: '2026-08-20', done: false }] });
    expect(searchAll(state, '')).toEqual({ tasks: [], clients: [] });
    expect(searchAll(state, '   ')).toEqual({ tasks: [], clients: [] });
  });

  it('matches a task by a case-insensitive substring of its title', () => {
    const state = stateWith({
      tasks: [
        { id: 't1', title: 'Call the plumber', clientId: null, date: '2026-08-20', done: false },
        { id: 't2', title: 'Buy milk', clientId: null, date: '2026-08-20', done: false }
      ]
    });
    expect(searchAll(state, 'PLUMBER').tasks.map((t) => t.id)).toEqual(['t1']);
  });

  it('matches a task by tag', () => {
    const state = stateWith({
      tasks: [
        { id: 't1', title: 'Morning run', clientId: null, date: '2026-08-20', done: false, tags: ['gym', 'health'] },
        { id: 't2', title: 'Buy milk', clientId: null, date: '2026-08-20', done: false }
      ]
    });
    expect(searchAll(state, 'gym').tasks.map((t) => t.id)).toEqual(['t1']);
  });

  it('matches a client by a case-insensitive substring of its name', () => {
    const a = mkClient('Bright Smile Dental');
    const b = mkClient('Verma Orthodontics');
    const state = stateWith({ clients: [a, b] });
    expect(searchAll(state, 'smile').clients.map((c) => c.id)).toEqual([a.id]);
  });

  it('searches tasks and clients independently in the same call', () => {
    const client = mkClient('Dental Studio');
    const state = stateWith({
      clients: [client],
      tasks: [{ id: 't1', title: 'Dental checkup reminder', clientId: null, date: '2026-08-20', done: false }]
    });
    const results = searchAll(state, 'dental');
    expect(results.tasks.map((t) => t.id)).toEqual(['t1']);
    expect(results.clients.map((c) => c.id)).toEqual([client.id]);
  });
});
