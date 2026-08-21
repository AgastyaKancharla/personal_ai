import { Client, Task, TrackerState } from './types';

export interface SearchResults {
  tasks: Task[];
  clients: Client[];
}

/**
 * Pure, case-insensitive substring search across the two kinds of things
 * this app actually has — no separate search index, just a filter over
 * the same TrackerState everything else reads. Matches a task by title or
 * any tag, a client by name.
 */
export function searchAll(state: TrackerState, query: string): SearchResults {
  const q = query.trim().toLowerCase();
  if (!q) return { tasks: [], clients: [] };

  const tasks = state.tasks.filter((t) => t.title.toLowerCase().includes(q) || (t.tags || []).some((tag) => tag.includes(q)));
  const clients = state.clients.filter((c) => c.name.toLowerCase().includes(q));

  return { tasks, clients };
}
