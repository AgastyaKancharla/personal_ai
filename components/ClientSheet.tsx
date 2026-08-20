'use client';

import { useState } from 'react';
import { ChevronLeft, Check, Trash2, X, Plus } from 'lucide-react';
import { C, DISPLAY } from '@/lib/theme';
import { STAGES, stageIndex, CATALOGUE } from '@/lib/catalogue';
import { inr } from '@/lib/dates';
import { Client } from '@/lib/types';
import { Actions } from '@/lib/actions';
import { Eyebrow } from './Primitives';

type Mode = 'one' | 'paste' | 'tpl';

export function ClientSheet({ client, actions, onClose }: { client: Client; actions: Actions; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('one');
  const [one, setOne] = useState('');
  const [paste, setPaste] = useState('');
  const total = client.deliverables.length;
  const built = client.deliverables.filter((d) => d.done).length;
  const balance = Math.max(0, (Number(client.quoteValue) || 0) - (Number(client.advance) || 0));

  // Deliverables are always appended, never inserted mid-array, so items
  // from the same service template naturally stay contiguous — grouping
  // consecutive same-category runs is enough to separate "GBP Optimization"
  // from "Website Development" without a full group-by pass. Items with no
  // category (ad-hoc adds, pasted quote lines) render under no header at
  // all, same as before this existed.
  const deliverableGroups = client.deliverables.reduce<{ category?: string; items: typeof client.deliverables }[]>((acc, d) => {
    const last = acc[acc.length - 1];
    if (last && last.category === d.category) last.items.push(d);
    else acc.push({ category: d.category, items: [d] });
    return acc;
  }, []);

  const addPasted = () => {
    const lines = paste
      .split('\n')
      .map((l) => l.replace(/^[\s•\-–*]*\d*[.)]?\s*/, '').trim())
      .filter((l) => l.length > 2 && l.length < 160 && !/^(total|subtotal|gst|amount|₹|rs\.?)\b/i.test(l));
    if (lines.length) actions.addDeliverables(client.id, lines);
    setPaste('');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: C.paper }}>
      <div className="mx-auto px-4 pt-4 pb-16" style={{ maxWidth: 480 }}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={onClose} className="flex items-center gap-1" style={{ color: C.muted, fontSize: 13 }}>
            <ChevronLeft size={16} /> Back
          </button>
          <button
            onClick={() => {
              actions.deleteClient(client.id);
              onClose();
            }}
            style={{ color: C.line }}
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div style={{ fontFamily: DISPLAY, fontSize: 27, fontWeight: 800, color: C.ink, lineHeight: 1.1 }}>{client.name}</div>
        {client.phone && <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{client.phone}</div>}

        <div className="mt-5">
          <Eyebrow>Where they are</Eyebrow>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {STAGES.map((s, i) => {
              const active = client.stage === s.key;
              const passed = stageIndex(client.stage) > i;
              return (
                <button
                  key={s.key}
                  onClick={() => actions.setStage(client.id, s.key)}
                  className="rounded-lg px-2.5 py-2 shrink-0"
                  style={{ background: active ? C.teal : passed ? C.tealSoft : C.white, border: `1px solid ${active ? C.teal : C.line}` }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: active ? C.white : passed ? C.tealDeep : C.muted }}>{s.short}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 rounded-2xl p-4" style={{ background: C.white, border: `1px solid ${C.line}` }}>
          <Eyebrow>Money</Eyebrow>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 4 }}>Quote value</div>
              <input
                type="number"
                value={client.quoteValue || ''}
                onChange={(e) => actions.updateClient(client.id, { quoteValue: e.target.value })}
                placeholder="0"
                className="w-full rounded-lg px-2.5 outline-none"
                style={{ height: 38, fontSize: 14, border: `1px solid ${C.line}`, color: C.ink }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 4 }}>Advance received</div>
              <input
                type="number"
                value={client.advance || ''}
                onChange={(e) => actions.updateClient(client.id, { advance: e.target.value })}
                placeholder="0"
                className="w-full rounded-lg px-2.5 outline-none"
                style={{ height: 38, fontSize: 14, border: `1px solid ${C.line}`, color: C.ink }}
              />
            </div>
          </div>
          <div className="flex items-baseline justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
            <span style={{ fontSize: 12, color: C.muted }}>Balance due</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: balance > 0 ? C.orange : C.teal }}>{inr(balance)}</span>
          </div>
        </div>

        <div className="mt-4 rounded-2xl p-4" style={{ background: C.white, border: `1px solid ${C.line}` }}>
          <div className="flex items-baseline justify-between mb-1">
            <span style={{ fontSize: 10, letterSpacing: '0.14em', color: C.muted, fontWeight: 600 }} className="uppercase">
              Promised vs built
            </span>
            <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, color: C.ink }}>
              {built}/{total}
            </span>
          </div>
          {total > 0 && (
            <div className="flex gap-1 mb-3">
              {client.deliverables.map((d) => (
                <div key={d.id} className="flex-1 rounded-full" style={{ height: 6, background: d.done ? C.teal : C.line }} />
              ))}
            </div>
          )}

          {total === 0 && (
            <div className="rounded-2xl p-5 text-center" style={{ border: `1px dashed ${C.line}`, color: C.muted, fontSize: 13 }}>
              Nothing promised yet. Pull it from the final quote below.
            </div>
          )}
          {deliverableGroups.map((g, gi) => (
            <div key={gi}>
              {g.category && (
                <div
                  style={{ fontSize: 10, letterSpacing: '0.1em', color: C.teal, fontWeight: 700, marginTop: gi > 0 ? 14 : 0, marginBottom: 4 }}
                  className="uppercase"
                >
                  {g.category}
                </div>
              )}
              {g.items.map((d) => (
                <div key={d.id} className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
                  <button
                    onClick={() => actions.toggleDeliverable(client.id, d.id)}
                    className="shrink-0 rounded-md flex items-center justify-center"
                    style={{ width: 20, height: 20, marginTop: 1, border: `1.5px solid ${d.done ? C.teal : C.line}`, background: d.done ? C.teal : 'transparent' }}
                  >
                    {d.done && <Check size={12} color={C.white} strokeWidth={3} />}
                  </button>
                  <span
                    className="flex-1"
                    style={{ fontSize: 13.5, lineHeight: 1.35, color: d.done ? C.muted : C.ink, textDecoration: d.done ? 'line-through' : 'none' }}
                  >
                    {d.text}
                  </span>
                  <button onClick={() => actions.deleteDeliverable(client.id, d.id)} style={{ color: C.line }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}

          <div className="flex gap-1.5 mt-4 mb-3">
            {(
              [
                ['one', 'Add one'],
                ['paste', 'Paste quote'],
                ['tpl', 'Templates']
              ] as [Mode, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className="rounded-lg px-2.5 py-1.5"
                style={{ fontSize: 11.5, fontWeight: 600, background: mode === k ? C.ink : C.paper, color: mode === k ? C.white : C.muted }}
              >
                {l}
              </button>
            ))}
          </div>

          {mode === 'one' && (
            <div className="flex gap-2">
              <input
                value={one}
                onChange={(e) => setOne(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && one.trim()) {
                    actions.addDeliverables(client.id, [one.trim()]);
                    setOne('');
                  }
                }}
                placeholder="What did you promise?"
                className="flex-1 rounded-xl px-3 outline-none"
                style={{ height: 40, fontSize: 13.5, border: `1px solid ${C.line}`, color: C.ink }}
              />
              <button
                onClick={() => {
                  if (one.trim()) {
                    actions.addDeliverables(client.id, [one.trim()]);
                    setOne('');
                  }
                }}
                className="rounded-xl flex items-center justify-center"
                style={{ width: 40, height: 40, background: C.teal }}
              >
                <Plus size={17} color={C.white} strokeWidth={2.5} />
              </button>
            </div>
          )}
          {mode === 'paste' && (
            <div>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={5}
                placeholder="Paste the scope lines from the final quote — one per line."
                className="w-full rounded-xl p-3 outline-none"
                style={{ fontSize: 13, border: `1px solid ${C.line}`, color: C.ink, resize: 'none' }}
              />
              <button onClick={addPasted} className="w-full rounded-xl mt-2" style={{ height: 40, background: C.teal, color: C.white, fontSize: 13.5, fontWeight: 600 }}>
                Turn into checklist
              </button>
            </div>
          )}
          {mode === 'tpl' && (
            <div className="space-y-3" style={{ maxHeight: 340, overflowY: 'auto' }}>
              {CATALOGUE.map((g) => (
                <div key={g.pillar}>
                  <div style={{ fontSize: 10, letterSpacing: '0.12em', color: C.teal, fontWeight: 700, marginBottom: 6 }} className="uppercase">
                    {g.pillar}
                  </div>
                  <div className="space-y-1.5">
                    {g.items.map((s) => (
                      <button
                        key={s.code}
                        onClick={() => actions.addDeliverables(client.id, s.steps, s.name)}
                        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
                        style={{ border: `1px solid ${C.line}` }}
                      >
                        <span style={{ fontFamily: DISPLAY, fontSize: 11, fontWeight: 700, color: C.muted }}>{s.code}</span>
                        <span className="flex-1" style={{ fontSize: 12.5, color: C.ink, fontWeight: 500, lineHeight: 1.3 }}>
                          {s.name}
                        </span>
                        <span style={{ fontSize: 11, color: C.muted }}>+{s.steps.length}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl p-4" style={{ background: C.white, border: `1px solid ${C.line}` }}>
          <Eyebrow>Next call back</Eyebrow>
          <input
            type="date"
            value={client.nextFollowUp || ''}
            onChange={(e) => actions.updateClient(client.id, { nextFollowUp: e.target.value })}
            className="w-full rounded-xl px-3 outline-none mb-3"
            style={{ height: 40, fontSize: 13.5, border: `1px solid ${C.line}`, color: C.ink }}
          />
          <Eyebrow>Notes</Eyebrow>
          <textarea
            value={client.notes || ''}
            onChange={(e) => actions.updateClient(client.id, { notes: e.target.value })}
            rows={4}
            placeholder="What they said, what they wanted, what's blocking."
            className="w-full rounded-xl p-3 outline-none"
            style={{ fontSize: 13.5, border: `1px solid ${C.line}`, color: C.ink, resize: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}
