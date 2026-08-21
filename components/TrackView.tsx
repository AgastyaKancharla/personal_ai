'use client';

import { useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { C, DISPLAY } from '@/lib/theme';
import { monthRange, weekRange } from '@/lib/dates';
import { TrackerState } from '@/lib/types';
import { Actions } from '@/lib/actions';
import { Card, Empty, Eyebrow } from './Primitives';
import { TaskRow } from './TaskRow';
import { summarizeRange } from '@/lib/schedule';

// A wide sentinel range rather than computing real min/max from the data —
// "All Time" just needs to cover anything that could plausibly exist.
const ALL_TIME = { startIso: '2000-01-01', endIso: '2099-12-31' };

const PRESETS: [string, () => { startIso: string; endIso: string }][] = [
  ['This Week', () => weekRange(0)],
  ['Last Week', () => weekRange(-1)],
  ['This Month', () => monthRange(0)],
  ['All Time', () => ALL_TIME]
];

export function TrackView({ data, actions }: { data: TrackerState; actions: Actions }) {
  const initial = weekRange(0);
  const [startDate, setStartDate] = useState(initial.startIso);
  const [endDate, setEndDate] = useState(initial.endIso);

  const byId = useMemo(() => Object.fromEntries(data.clients.map((c) => [c.id, c])), [data.clients]);
  const summary = summarizeRange(data, startDate, endDate);
  const done = summary.tasks.filter((t) => t.done);
  const notDone = summary.tasks.filter((t) => !t.done);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ListChecks size={16} color={C.teal} />
        <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, color: C.ink }}>Track</span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map(([label, getRange]) => (
          <button
            key={label}
            onClick={() => {
              const r = getRange();
              setStartDate(r.startIso);
              setEndDate(r.endIso);
            }}
            className="rounded-lg px-2.5 py-1.5"
            style={{ fontSize: 11.5, fontWeight: 600, background: C.paper, color: C.muted }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="flex-1 rounded-xl px-2 outline-none"
          style={{ fontSize: 12, height: 38, minWidth: 0, background: C.white, border: `1px solid ${C.line}`, color: C.ink }}
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="flex-1 rounded-xl px-2 outline-none"
          style={{ fontSize: 12, height: 38, minWidth: 0, background: C.white, border: `1px solid ${C.line}`, color: C.ink }}
        />
      </div>

      <Card>
        <div className="flex items-baseline justify-between">
          <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: summary.totalCount && summary.doneCount === summary.totalCount ? C.teal : C.ink }}>
            {summary.doneCount}/{summary.totalCount}
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>
            {summary.doneCount} done · {summary.totalCount - summary.doneCount} pending
            {summary.overdueCount > 0 ? ` · ${summary.overdueCount} overdue` : ''}
          </div>
        </div>
      </Card>

      {summary.totalCount === 0 ? (
        <Empty>No tasks in this range.</Empty>
      ) : (
        <>
          {notDone.length > 0 && (
            <Card>
              <Eyebrow>Not done — {notDone.length}</Eyebrow>
              {notDone.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  client={byId[t.clientId || '']}
                  clients={data.clients}
                  onToggle={actions.toggleTask}
                  onDelete={actions.deleteTask}
                  onUpdate={actions.updateTask}
                />
              ))}
            </Card>
          )}
          {done.length > 0 && (
            <Card>
              <Eyebrow tone={C.teal}>Done — {done.length}</Eyebrow>
              {done.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  client={byId[t.clientId || '']}
                  clients={data.clients}
                  onToggle={actions.toggleTask}
                  onDelete={actions.deleteTask}
                  onUpdate={actions.updateTask}
                />
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
