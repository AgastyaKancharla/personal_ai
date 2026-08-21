'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { C, DISPLAY } from '@/lib/theme';
import { STAGES } from '@/lib/catalogue';
import { inr } from '@/lib/dates';
import { TrackerState } from '@/lib/types';
import { Actions } from '@/lib/actions';

// A mobile-friendly stand-in for drag-and-drop Kanban: horizontal-scrolling
// columns, one per pipeline stage, with a card per client and a pair of
// chevrons to move it to the adjacent stage. Dragging cards between columns
// works poorly on a phone and would pull in a whole new dependency for a
// single-user tool — a tap is the same one-handed gesture the rest of this
// app already uses everywhere else.
export function PipelineBoard({ data, actions }: { data: TrackerState; actions: Actions }) {
  const move = (clientId: string, toIndex: number) => {
    if (toIndex < 0 || toIndex >= STAGES.length) return;
    actions.setStage(clientId, STAGES[toIndex].key);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollSnapType: 'x proximity' }}>
      {STAGES.map((stage, i) => {
        const clients = data.clients.filter((c) => c.stage === stage.key);
        return (
          <div key={stage.key} className="shrink-0 rounded-2xl p-3" style={{ width: 200, background: C.white, border: `1px solid ${C.line}`, scrollSnapAlign: 'start' }}>
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.ink }}>{stage.label}</span>
              <span style={{ fontSize: 11, color: C.muted }}>{clients.length}</span>
            </div>
            <div className="space-y-2">
              {clients.length === 0 && <div style={{ fontSize: 11.5, color: C.line, padding: '8px 2px' }}>—</div>}
              {clients.map((c) => (
                <div key={c.id} className="rounded-xl p-2.5" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                  <button onClick={() => actions.openClient(c.id)} className="block w-full text-left">
                    <div style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{c.name}</div>
                    {Number(c.quoteValue) > 0 && <div style={{ fontSize: 11, color: C.teal, marginTop: 2, fontWeight: 600 }}>{inr(c.quoteValue)}</div>}
                  </button>
                  <div className="flex items-center justify-between mt-2">
                    <button
                      onClick={() => move(c.id, i - 1)}
                      disabled={i === 0}
                      className="rounded-lg flex items-center justify-center"
                      style={{ width: 24, height: 24, opacity: i === 0 ? 0.25 : 1, background: C.white, border: `1px solid ${C.line}` }}
                    >
                      <ChevronLeft size={12} color={C.muted} />
                    </button>
                    <button
                      onClick={() => move(c.id, i + 1)}
                      disabled={i === STAGES.length - 1}
                      className="rounded-lg flex items-center justify-center"
                      style={{ width: 24, height: 24, opacity: i === STAGES.length - 1 ? 0.25 : 1, background: C.white, border: `1px solid ${C.line}` }}
                    >
                      <ChevronRight size={12} color={C.muted} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
