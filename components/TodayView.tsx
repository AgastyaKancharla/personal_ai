'use client';

import { useMemo } from 'react';
import { Phone } from 'lucide-react';
import { C, DISPLAY, BODY } from '@/lib/theme';
import { STAGES, stageIndex } from '@/lib/catalogue';
import { DOW, MONTHS, today } from '@/lib/dates';
import { TrackerState } from '@/lib/types';
import { Actions } from '@/lib/actions';
import { Card, Empty, Eyebrow } from './Primitives';
import { TaskRow } from './TaskRow';
import { AddTask } from './AddTask';

export function TodayView({ data, actions }: { data: TrackerState; actions: Actions }) {
  const t = today();
  const byId = useMemo(() => Object.fromEntries(data.clients.map((c) => [c.id, c])), [data.clients]);
  const todays = data.tasks.filter((x) => x.date === t);
  const overdue = data.tasks.filter((x) => x.date < t && !x.done);
  const followUps = data.clients.filter((c) => c.nextFollowUp && c.nextFollowUp <= t && c.stage !== 'delivered');
  const d = new Date();
  const done = todays.filter((x) => x.done).length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <div style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 800, lineHeight: 0.9, color: C.ink }}>{d.getDate()}</div>
          <div style={{ fontFamily: BODY, fontSize: 13, color: C.muted, marginTop: 4 }}>
            {DOW[(d.getDay() + 6) % 7]}, {MONTHS[d.getMonth()]}
          </div>
        </div>
        <div className="text-right">
          <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: todays.length && done === todays.length ? C.teal : C.ink }}>
            {done}/{todays.length}
          </div>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', color: C.muted, fontWeight: 600 }} className="uppercase">
            done today
          </div>
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: C.orangeSoft, border: `1px solid ${C.orange}33` }}>
          <Eyebrow tone={C.orange}>Slipped — {overdue.length} pending</Eyebrow>
          {overdue.map((x) => (
            <TaskRow
              key={x.id}
              task={x}
              client={byId[x.clientId || '']}
              clients={data.clients}
              overdue
              onToggle={actions.toggleTask}
              onDelete={actions.deleteTask}
              onUpdate={actions.updateTask}
            />
          ))}
        </div>
      )}

      <Card>
        <Eyebrow>Today</Eyebrow>
        {todays.length === 0 ? (
          <Empty>Nothing planned. Add the first thing you&apos;ll do.</Empty>
        ) : (
          todays.map((x) => (
            <TaskRow
              key={x.id}
              task={x}
              client={byId[x.clientId || '']}
              clients={data.clients}
              onToggle={actions.toggleTask}
              onDelete={actions.deleteTask}
              onUpdate={actions.updateTask}
            />
          ))
        )}
        <AddTask date={t} clients={data.clients} onAdd={actions.addTask} />
      </Card>

      {followUps.length > 0 && (
        <Card>
          <Eyebrow>Call back today</Eyebrow>
          {followUps.map((c) => (
            <button
              key={c.id}
              onClick={() => actions.openClient(c.id)}
              className="w-full flex items-center gap-3 py-2.5 text-left"
              style={{ borderBottom: `1px solid ${C.line}` }}
            >
              <Phone size={14} color={C.teal} />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 14, color: C.ink }}>{c.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  {STAGES[stageIndex(c.stage)].label}
                  {c.phone ? ` · ${c.phone}` : ''}
                </div>
              </div>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
