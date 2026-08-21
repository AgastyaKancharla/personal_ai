'use client';

import { useState } from 'react';
import { Columns3, List, Plus, X } from 'lucide-react';
import { C, DISPLAY } from '@/lib/theme';
import { STAGES, stageIndex } from '@/lib/catalogue';
import { inr } from '@/lib/dates';
import { summarizeRevenue } from '@/lib/revenue';
import { TrackerState } from '@/lib/types';
import { Actions } from '@/lib/actions';
import { Card, Empty, Eyebrow } from './Primitives';
import { PipelineBoard } from './PipelineBoard';

export function ClientsView({ data, actions }: { data: TrackerState; actions: Actions }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [view, setView] = useState<'list' | 'board'>('list');

  const add = () => {
    if (!name.trim()) return;
    actions.addClient(name.trim(), phone.trim());
    setName('');
    setPhone('');
    setAdding(false);
  };

  const grouped = STAGES.map((s) => ({ ...s, list: data.clients.filter((c) => c.stage === s.key) })).filter((g) => g.list.length);
  const revenue = summarizeRevenue(data.clients);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: C.ink }}>{data.clients.length} clients</div>
          <div style={{ fontSize: 11.5, color: C.muted }}>
            {data.clients.filter((c) => stageIndex(c.stage) >= 5).length} paid · {data.clients.filter((c) => c.stage === 'delivered').length} delivered
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl p-1" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
            <button
              onClick={() => setView('list')}
              className="rounded-lg flex items-center justify-center"
              style={{ width: 30, height: 30, background: view === 'list' ? C.white : 'transparent' }}
            >
              <List size={13} color={view === 'list' ? C.ink : C.muted} />
            </button>
            <button
              onClick={() => setView('board')}
              className="rounded-lg flex items-center justify-center"
              style={{ width: 30, height: 30, background: view === 'board' ? C.white : 'transparent' }}
            >
              <Columns3 size={13} color={view === 'board' ? C.ink : C.muted} />
            </button>
          </div>
          <button onClick={() => setAdding(!adding)} className="rounded-xl px-3 flex items-center gap-1.5" style={{ height: 38, background: C.teal }}>
            {adding ? <X size={15} color={C.white} /> : <Plus size={15} color={C.white} strokeWidth={2.5} />}
            <span style={{ fontSize: 13, color: C.white, fontWeight: 600 }}>{adding ? 'Cancel' : 'New'}</span>
          </button>
        </div>
      </div>

      {revenue.totalQuoted > 0 && (
        <Card>
          <Eyebrow>Revenue</Eyebrow>
          <div className="flex gap-2">
            <div className="flex-1">
              <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: C.ink }}>{inr(revenue.totalQuoted)}</div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>Quoted</div>
            </div>
            <div className="flex-1">
              <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: C.teal }}>{inr(revenue.totalCollected)}</div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>Collected</div>
            </div>
            <div className="flex-1">
              <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: revenue.totalOutstanding > 0 ? C.orange : C.ink }}>
                {inr(revenue.totalOutstanding)}
              </div>
              <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>Outstanding</div>
            </div>
          </div>
        </Card>
      )}

      {adding && (
        <Card>
          <Eyebrow>New client</Eyebrow>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Business name"
            className="w-full rounded-xl px-3 outline-none mb-2"
            style={{ fontSize: 14, height: 42, border: `1px solid ${C.line}`, color: C.ink }}
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Phone (optional)"
            className="w-full rounded-xl px-3 outline-none mb-3"
            style={{ fontSize: 14, height: 42, border: `1px solid ${C.line}`, color: C.ink }}
          />
          <button onClick={add} className="w-full rounded-xl" style={{ height: 44, background: C.ink, color: C.white, fontSize: 14, fontWeight: 600 }}>
            Add to cold call
          </button>
        </Card>
      )}

      {data.clients.length === 0 && !adding && <Empty>No clients yet. Add the first business you called.</Empty>}

      {view === 'board' && data.clients.length > 0 && <PipelineBoard data={data} actions={actions} />}

      {view === 'list' && grouped.map((g) => (
        <div key={g.key}>
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-full" style={{ width: 7, height: 7, background: stageIndex(g.key) >= 5 ? C.teal : C.orange }} />
            <span style={{ fontSize: 11, letterSpacing: '0.12em', color: C.ink, fontWeight: 700 }} className="uppercase">
              {g.label}
            </span>
            <span style={{ fontSize: 11, color: C.muted }}>{g.list.length}</span>
          </div>
          <div className="space-y-2">
            {g.list.map((c) => {
              const total = c.deliverables.length;
              const built = c.deliverables.filter((d) => d.done).length;
              return (
                <button
                  key={c.id}
                  onClick={() => actions.openClient(c.id)}
                  className="w-full rounded-2xl p-3.5 text-left"
                  style={{ background: C.white, border: `1px solid ${C.line}` }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{c.name}</span>
                    {Number(c.quoteValue) > 0 && <span style={{ fontSize: 12.5, color: C.teal, fontWeight: 600 }}>{inr(c.quoteValue)}</span>}
                  </div>
                  {total > 0 ? (
                    <>
                      <div className="flex gap-1 mt-2.5">
                        {c.deliverables.map((d) => (
                          <div key={d.id} className="flex-1 rounded-full" style={{ height: 5, background: d.done ? C.teal : C.line }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                        {built} of {total} promises built
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>No promises listed yet</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
