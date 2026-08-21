'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { C, DISPLAY } from '@/lib/theme';
import { DOW, MONTHS, addDays, iso, mondayOf, today } from '@/lib/dates';
import { TrackerState } from '@/lib/types';
import { Actions } from '@/lib/actions';
import { TaskRow } from './TaskRow';
import { AddTask } from './AddTask';

export function WeekView({ data, actions }: { data: TrackerState; actions: Actions }) {
  const [offset, setOffset] = useState(0);
  const start = mondayOf(addDays(new Date(), offset * 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const t = today();
  const byId = useMemo(() => Object.fromEntries(data.clients.map((c) => [c.id, c])), [data.clients]);
  const [open, setOpen] = useState(t);
  const weekTasks = data.tasks.filter((x) => x.date >= iso(days[0]) && x.date <= iso(days[6]));
  const weekDone = weekTasks.filter((x) => x.done).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setOffset(offset - 1)} className="p-2 rounded-lg" style={{ border: `1px solid ${C.line}`, background: C.white }}>
          <ChevronLeft size={16} color={C.ink} />
        </button>
        <div className="text-center">
          <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, color: C.ink }}>
            {days[0].getDate()} {MONTHS[days[0].getMonth()].slice(0, 3)} – {days[6].getDate()} {MONTHS[days[6].getMonth()].slice(0, 3)}
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>
            {weekDone} of {weekTasks.length} done{offset === 0 ? ' · this week' : ''}
          </div>
        </div>
        <button onClick={() => setOffset(offset + 1)} className="p-2 rounded-lg" style={{ border: `1px solid ${C.line}`, background: C.white }}>
          <ChevronRight size={16} color={C.ink} />
        </button>
      </div>

      <div className="space-y-2">
        {days.map((d, i) => {
          const key = iso(d);
          const items = data.tasks.filter((x) => x.date === key);
          const isToday = key === t;
          const isOpen = open === key;
          return (
            <div key={key} className="rounded-2xl overflow-hidden" style={{ background: C.white, border: `1px solid ${isToday ? C.teal : C.line}` }}>
              <button onClick={() => setOpen(isOpen ? '' : key)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <div className="shrink-0 text-center" style={{ width: 34 }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.1em', color: isToday ? C.teal : C.muted, fontWeight: 700 }} className="uppercase">
                    {DOW[i]}
                  </div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 700, color: isToday ? C.teal : C.ink, lineHeight: 1.1 }}>{d.getDate()}</div>
                </div>
                <div className="flex-1 min-w-0">
                  {items.length === 0 ? (
                    <span style={{ fontSize: 12.5, color: C.line }}>—</span>
                  ) : (
                    <div className="flex gap-1 items-center flex-wrap">
                      {items.slice(0, 6).map((x) => (
                        <span key={x.id} className="rounded-full" style={{ width: 7, height: 7, background: x.done ? C.teal : C.orange }} />
                      ))}
                      <span style={{ fontSize: 12, color: C.muted, marginLeft: 4 }}>
                        {items.filter((x) => !x.done).length ? `${items.filter((x) => !x.done).length} open` : 'all clear'}
                      </span>
                    </div>
                  )}
                </div>
                <ChevronRight size={15} color={C.muted} style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} />
              </button>
              {isOpen && (
                <div className="px-4 pb-3" style={{ borderTop: `1px solid ${C.line}` }}>
                  <div className="pt-1">
                    {items.map((x) => (
                      <TaskRow
                        key={x.id}
                        task={x}
                        client={byId[x.clientId || '']}
                        clients={data.clients}
                        onToggle={actions.toggleTask}
                        onDelete={actions.deleteTask}
                        onUpdate={actions.updateTask}
                      />
                    ))}
                  </div>
                  <AddTask date={key} clients={data.clients} onAdd={actions.addTask} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
