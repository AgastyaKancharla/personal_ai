import { Client, StageKey, TrackerState } from './types';
import { Operation } from './stateOps';
import { resolveClient } from './parse/clients';
import { uid, todayRange, weekRange, monthRange, DateRange } from './dates';
import { summarizeRange, RangeSummary } from './schedule';

export type Period = 'today' | 'this_week' | 'next_week' | 'this_month';

export function rangeForPeriod(period: Period): DateRange {
  switch (period) {
    case 'today':
      return todayRange();
    case 'this_week':
      return weekRange(0);
    case 'next_week':
      return weekRange(1);
    case 'this_month':
      return monthRange(0);
  }
}

export function getSchedule(state: TrackerState, period: Period): RangeSummary {
  const { startIso, endIso } = rangeForPeriod(period);
  return summarizeRange(state, startIso, endIso);
}

export interface AddTaskArgs {
  title: string;
  date: string;
  clientName?: string | null;
}

export interface AddTaskPlan {
  op: Operation;
  note: string;
}

/**
 * Never guesses a client. An exact/fuzzy match links the task; an
 * ambiguous or unrecognized name still adds the task — low-stakes and
 * one-tap deletable, same reasoning as the rules engine's own generic task
 * fallback (lib/parse/index.ts) — but leaves it unlinked and says so,
 * rather than either guessing or refusing to log the task at all.
 */
export function buildAddTaskOp(clients: Client[], args: AddTaskArgs): AddTaskPlan {
  const match = args.clientName ? resolveClient(args.clientName, clients) : { client: null, kind: 'none' as const };
  const linked = match.kind === 'exact' || match.kind === 'fuzzy';
  const op: Operation = { type: 'addTask', id: uid(), title: args.title, clientId: linked ? match.client!.id : null, date: args.date };
  const note = !args.clientName
    ? `Added "${args.title}" for ${args.date}.`
    : linked
      ? `Added "${args.title}" for ${args.date}, linked to ${match.client!.name}.`
      : `Added "${args.title}" for ${args.date} — couldn't confidently match "${args.clientName}" to a client, left it unlinked.`;
  return { op, note };
}

export interface UpdateClientArgs {
  clientName: string;
  stage?: StageKey;
  quoteValue?: number;
  advance?: number;
  notes?: string;
  nextFollowUp?: string;
}

export interface UpdateClientPlan {
  ok: boolean;
  ops: Operation[];
  note: string;
  clientId: string | null;
}

/**
 * Blocking, not degrading, unlike buildAddTaskOp above: this mutates a
 * real client's stage/money/notes, exactly the class of mistake this
 * app's hard "never guess" rule exists to prevent. An ambiguous or
 * unrecognized client name produces zero operations.
 */
export function buildUpdateClientOps(clients: Client[], args: UpdateClientArgs): UpdateClientPlan {
  const match = resolveClient(args.clientName, clients);
  if (match.kind !== 'exact' && match.kind !== 'fuzzy') {
    return { ok: false, ops: [], note: `Couldn't confidently match "${args.clientName}" to one client — nothing changed. Try a fuller name.`, clientId: null };
  }
  const client = match.client!;
  const ops: Operation[] = [];

  // A stage change goes through its own operation, never folded into the
  // updateClient patch below — applyOp's updateClient case does a raw
  // {...c, ...patch} merge and would skip stamping history[stage], which
  // is setStage's job.
  if (args.stage) ops.push({ type: 'setStage', id: client.id, stage: args.stage });

  const patch: Partial<Client> = {};
  if (args.quoteValue != null) patch.quoteValue = String(args.quoteValue);
  if (args.advance != null) patch.advance = String(args.advance);
  if (args.notes != null) patch.notes = args.notes;
  if (args.nextFollowUp != null) patch.nextFollowUp = args.nextFollowUp;
  if (Object.keys(patch).length) ops.push({ type: 'updateClient', id: client.id, patch });

  if (!ops.length) return { ok: false, ops: [], note: `Matched ${client.name}, but nothing to update was given.`, clientId: client.id };

  const parts = [args.stage ? `stage → ${args.stage}` : null, ...Object.keys(patch)].filter(Boolean);
  return { ok: true, ops, note: `Updated ${client.name}: ${parts.join(', ')}.`, clientId: client.id };
}
