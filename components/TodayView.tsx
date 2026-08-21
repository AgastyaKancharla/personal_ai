'use client';

import { useMemo, useState } from 'react';
import { ListPlus, Phone, Search, UserPlus, Zap } from 'lucide-react';
import { C, DISPLAY, BODY } from '@/lib/theme';
import { STAGES, stageIndex } from '@/lib/catalogue';
import { DOW, MONTHS, byTimeline, today } from '@/lib/dates';
import { TrackerState } from '@/lib/types';
import { Actions } from '@/lib/actions';
import { Card, Empty, Eyebrow } from './Primitives';
import { TaskRow } from './TaskRow';
import { AddTask } from './AddTask';
import { TrackView } from './TrackView';

export function TodayView({ data, actions, onOpenSearch }: { data: TrackerState; actions: Actions; onOpenSearch: () => void }) {
  const t = today();
  const byId = useMemo(() => Object.fromEntries(data.clients.map((c) => [c.id, c])), [data.clients]);
  // Timed tasks lead the day's list, chronologically; untimed tasks follow,
  // ranked by the `important` flag — the order a day actually runs in.
  const todays = data.tasks.filter((x) => x.date === t).sort(byTimeline);
  const overdue = data.tasks.filter((x) => x.date < t && !x.done).sort(byTimeline);
  const followUps = data.clients.filter((c) => c.nextFollowUp && c.nextFollowUp <= t && c.stage !== 'delivered');
  const d = new Date();
  const done = todays.filter((x) => x.done).length;

  // Only one quick-action form open at a time, right on the dashboard —
  // no navigating to Clients just to add one, no scrolling to the Today
  // card just to add a task.
  const [quickForm, setQuickForm] = useState<'task' | 'client' | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  const clearOverdue = () => overdue.forEach((x) => actions.updateTask(x.id, { date: t }));

  const addClientQuick = () => {
    if (!clientName.trim()) return;
    actions.addClient(clientName.trim(), clientPhone.trim());
    setClientName('');
    setClientPhone('');
    setQuickForm(null);
  };

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

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setQuickForm(quickForm === 'task' ? null : 'task')}
          className="rounded-lg px-2.5 py-1.5 flex items-center gap-1.5"
          style={{ fontSize: 11.5, fontWeight: 600, background: quickForm === 'task' ? C.ink : C.paper, color: quickForm === 'task' ? C.white : C.muted }}
        >
          <ListPlus size={12} /> Add task
        </button>
        <button
          onClick={() => setQuickForm(quickForm === 'client' ? null : 'client')}
          className="rounded-lg px-2.5 py-1.5 flex items-center gap-1.5"
          style={{ fontSize: 11.5, fontWeight: 600, background: quickForm === 'client' ? C.ink : C.paper, color: quickForm === 'client' ? C.white : C.muted }}
        >
          <UserPlus size={12} /> New client
        </button>
        <button onClick={onOpenSearch} className="rounded-lg px-2.5 py-1.5 flex items-center gap-1.5" style={{ fontSize: 11.5, fontWeight: 600, background: C.paper, color: C.muted }}>
          <Search size={12} /> Search
        </button>
        <button
          onClick={clearOverdue}
          disabled={overdue.length === 0}
          className="rounded-lg px-2.5 py-1.5 flex items-center gap-1.5"
          style={{ fontSize: 11.5, fontWeight: 600, background: C.paper, color: overdue.length === 0 ? C.line : C.muted, opacity: overdue.length === 0 ? 0.6 : 1 }}
        >
          <Zap size={12} /> Clear overdue
        </button>
      </div>

      {quickForm === 'task' && (
        <Card>
          <Eyebrow>Add task</Eyebrow>
          <AddTask
            date={t}
            clients={data.clients}
            onAdd={(title, clientId, date, recurrence, time, tags) => {
              actions.addTask(title, clientId, date, recurrence, time, tags);
              setQuickForm(null);
            }}
          />
        </Card>
      )}

      {quickForm === 'client' && (
        <Card>
          <Eyebrow>New client</Eyebrow>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Business name"
            className="w-full rounded-xl px-3 outline-none mb-2"
            style={{ fontSize: 14, height: 42, border: `1px solid ${C.line}`, color: C.ink }}
          />
          <input
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addClientQuick()}
            placeholder="Phone (optional)"
            className="w-full rounded-xl px-3 outline-none mb-3"
            style={{ fontSize: 14, height: 42, border: `1px solid ${C.line}`, color: C.ink }}
          />
          <button onClick={addClientQuick} className="w-full rounded-xl" style={{ height: 44, background: C.ink, color: C.white, fontSize: 14, fontWeight: 600 }}>
            Add to cold call
          </button>
        </Card>
      )}

      {overdue.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: C.orangeSoft, border: `1px solid ${C.orange}33` }}>
          <div className="flex items-center justify-between mb-1">
            <Eyebrow tone={C.orange}>Slipped — {overdue.length} pending</Eyebrow>
            <button onClick={clearOverdue} style={{ fontSize: 11, color: C.orange, fontWeight: 700, textDecoration: 'underline', marginBottom: 8 }}>
              Move all to today
            </button>
          </div>
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

      <div className="pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
        <TrackView data={data} actions={actions} excludeDate={t} />
      </div>
    </div>
  );
}
