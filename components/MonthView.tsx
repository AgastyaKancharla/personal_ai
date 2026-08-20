'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { C, DISPLAY } from '@/lib/theme';
import { DOW, MONTHS, inr, today } from '@/lib/dates';
import { TrackerState } from '@/lib/types';
import { Card, Empty, Eyebrow } from './Primitives';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: C.white, border: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', color: C.muted, fontWeight: 600 }} className="uppercase">
        {label}
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 700, color: tone || C.ink, marginTop: 3 }}>{value}</div>
    </div>
  );
}

export function MonthView({ data }: { data: TrackerState }) {
  const [offset, setOffset] = useState(0);
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const y = base.getFullYear();
  const m = base.getMonth();
  const prefix = `${y}-${pad(m + 1)}`;
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const total = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const t = today();

  const monthTasks = data.tasks.filter((x) => x.date.startsWith(prefix));
  const inMonth = (d?: string) => !!d && d.startsWith(prefix);
  const advanceIn = data.clients.filter((c) => inMonth(c.history?.advance)).reduce((s, c) => s + (Number(c.advance) || 0), 0);
  const quotedOut = data.clients.filter((c) => inMonth(c.history?.quoted)).reduce((s, c) => s + (Number(c.quoteValue) || 0), 0);
  const deliveredCount = data.clients.filter((c) => inMonth(c.history?.delivered)).length;
  const newLeads = data.clients.filter((c) => inMonth(c.createdAt)).length;
  const balanceDue = data.clients
    .filter((c) => c.stage !== 'delivered')
    .reduce((s, c) => s + Math.max(0, (Number(c.quoteValue) || 0) - (Number(c.advance) || 0)), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setOffset(offset - 1)} className="p-2 rounded-lg" style={{ border: `1px solid ${C.line}`, background: C.white }}>
          <ChevronLeft size={16} color={C.ink} />
        </button>
        <div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 700, color: C.ink }}>
          {MONTHS[m]} {y}
        </div>
        <button onClick={() => setOffset(offset + 1)} className="p-2 rounded-lg" style={{ border: `1px solid ${C.line}`, background: C.white }}>
          <ChevronRight size={16} color={C.ink} />
        </button>
      </div>

      <Card>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DOW.map((d) => (
            <div key={d} className="text-center" style={{ fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: '0.06em' }}>
              {d[0]}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;
            const key = `${prefix}-${pad(day)}`;
            const items = data.tasks.filter((x) => x.date === key);
            const openCount = items.filter((x) => !x.done).length;
            const isToday = key === t;
            return (
              <div
                key={i}
                className="rounded-lg flex flex-col items-center justify-center py-1.5"
                style={{ background: isToday ? C.teal : items.length ? C.tealSoft : 'transparent', minHeight: 38 }}
              >
                <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? C.white : C.ink }}>{day}</span>
                {items.length > 0 && (
                  <span className="rounded-full mt-0.5" style={{ width: 5, height: 5, background: isToday ? C.white : openCount ? C.orange : C.teal }} />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Advance in" value={inr(advanceIn)} tone={C.teal} />
        <Stat label="Quoted out" value={inr(quotedOut)} />
        <Stat label="Delivered" value={deliveredCount} />
        <Stat label="New leads" value={newLeads} />
      </div>

      <div className="rounded-2xl p-4" style={{ background: C.tealDeep }}>
        <div style={{ fontSize: 10, letterSpacing: '0.14em', color: '#8FBDBB', fontWeight: 600 }} className="uppercase">
          Balance still to collect
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 800, color: C.white, marginTop: 4 }}>{inr(balanceDue)}</div>
        <div style={{ fontSize: 11.5, color: '#8FBDBB', marginTop: 2 }}>across {data.clients.filter((c) => c.stage !== 'delivered').length} live clients</div>
      </div>

      <Card>
        <Eyebrow>
          {MONTHS[m]} tasks — {monthTasks.filter((x) => x.done).length} of {monthTasks.length} done
        </Eyebrow>
        {monthTasks.length === 0 ? (
          <Empty>No tasks logged this month.</Empty>
        ) : (
          <div className="flex gap-1 flex-wrap">
            {monthTasks.map((x) => (
              <span key={x.id} className="rounded" style={{ width: 12, height: 12, background: x.done ? C.teal : C.orange, opacity: x.done ? 1 : 0.55 }} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
