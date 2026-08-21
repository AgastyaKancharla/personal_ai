import { Client, Task, TrackerState } from './types';
import { today } from './dates';

export interface ScheduleTaskSummary {
  id: string;
  title: string;
  date: string;
  done: boolean;
  clientId: string | null;
  clientName: string | null;
  important?: boolean;
}

export interface FollowUpSummary {
  clientId: string;
  clientName: string;
  stage: string;
  nextFollowUp: string;
}

export interface RangeSummary {
  startIso: string;
  endIso: string;
  tasks: ScheduleTaskSummary[];
  totalCount: number;
  doneCount: number;
  overdueTasks: ScheduleTaskSummary[];
  overdueCount: number;
  followUpsDue: FollowUpSummary[];
}

/**
 * Pure. No I/O, no hidden clock — `todayIso` is injected (defaults to the
 * real today for convenience), same convention as ctx.today in lib/parse/.
 * The one reusable "what's due in this range" function this app doesn't
 * otherwise have — WeekView/MonthView/TodayView each hand-roll their own
 * inline version of this; this is written to be a drop-in replacement for
 * that later, not to require refactoring them now.
 */
export function summarizeRange(state: TrackerState, startIso: string, endIso: string, todayIso: string = today()): RangeSummary {
  const byId = new Map(state.clients.map((c) => [c.id, c] as const));
  const toSummary = (t: Task): ScheduleTaskSummary => ({
    id: t.id,
    title: t.title,
    date: t.date,
    done: t.done,
    clientId: t.clientId,
    clientName: t.clientId ? byId.get(t.clientId)?.name ?? null : null,
    important: t.important
  });

  const tasks = state.tasks
    .filter((t) => t.date >= startIso && t.date <= endIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(toSummary);

  // Naturally empty for a range entirely in the future — nothing to flag
  // as overdue about tasks that haven't come due yet.
  const overdueTasks = tasks.filter((t) => !t.done && t.date < todayIso);

  // Generalizes TodayView's `nextFollowUp <= today` check to the requested
  // range's end: a follow-up overdue from before the range started is
  // still worth surfacing as due, same as TodayView already does for "today".
  const followUpsDue: FollowUpSummary[] = state.clients
    .filter((c: Client) => c.nextFollowUp && c.nextFollowUp <= endIso && c.stage !== 'delivered')
    .sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp))
    .map((c) => ({ clientId: c.id, clientName: c.name, stage: c.stage, nextFollowUp: c.nextFollowUp }));

  return {
    startIso,
    endIso,
    tasks,
    totalCount: tasks.length,
    doneCount: tasks.filter((t) => t.done).length,
    overdueTasks,
    overdueCount: overdueTasks.length,
    followUpsDue
  };
}
