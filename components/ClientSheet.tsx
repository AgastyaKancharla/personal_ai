'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronDown, ChevronRight, Check, Trash2, X, Plus, Upload, Loader2 } from 'lucide-react';
import { C, DISPLAY } from '@/lib/theme';
import { STAGES, stageIndex, CATALOGUE } from '@/lib/catalogue';
import { inr } from '@/lib/dates';
import { Client } from '@/lib/types';
import { Actions } from '@/lib/actions';
import { Eyebrow } from './Primitives';

type Mode = 'one' | 'paste' | 'tpl' | 'upload';

interface ReviewItem {
  include: boolean;
  text: string;
  price: string;
  deadline: string;
  category?: string;
}

export function ClientSheet({ client, actions, onClose }: { client: Client; actions: Actions; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('one');
  const [one, setOne] = useState('');
  const [paste, setPaste] = useState('');
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [uploadError, setUploadError] = useState('');
  const [reviewItems, setReviewItems] = useState<ReviewItem[] | null>(null);
  // Which service groups are expanded — collapsed by default so a client
  // with several services shows a scannable progress-per-service list
  // instead of every item at once. Keyed by category name; the no-category
  // group (ad-hoc/pasted items with no service to name) has no header to
  // click and always renders its items, same as before this existed.
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
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
    if (lines.length) actions.addDeliverables(client.id, lines.map((text) => ({ text })));
    setPaste('');
  };

  const uploadQuoteDoc = async (file: File) => {
    setUploadStatus('loading');
    setUploadError('');
    setReviewItems(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/quote-doc', { method: 'POST', body });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Could not read that file.');
      const items: { text: string; price?: string; deadline?: string; category?: string }[] = out.items || [];
      if (!items.length) throw new Error('Nothing recognizable in that file — try Paste quote instead.');
      setReviewItems(
        items.map((it) => ({ include: true, text: it.text, price: it.price || '', deadline: it.deadline || '', category: it.category }))
      );
      setUploadStatus('idle');
    } catch (e: any) {
      setUploadStatus('error');
      setUploadError(e.message || 'Could not read that file.');
    }
  };

  const commitReviewed = () => {
    if (!reviewItems) return;
    const chosen = reviewItems.filter((it) => it.include && it.text.trim());
    // Grouped by consecutive same category (mirrors deliverableGroups' own
    // grouping) so items from a multi-service upload land in the checklist
    // already separated by service, one addDeliverables call per group.
    const groups = chosen.reduce<{ category?: string; items: ReviewItem[] }[]>((acc, it) => {
      const last = acc[acc.length - 1];
      if (last && last.category === it.category) last.items.push(it);
      else acc.push({ category: it.category, items: [it] });
      return acc;
    }, []);
    for (const g of groups) {
      actions.addDeliverables(
        client.id,
        g.items.map((it) => ({ text: it.text.trim(), price: it.price.trim() || undefined, deadline: it.deadline.trim() || undefined })),
        g.category
      );
    }
    setReviewItems(null);
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
              // One tap here used to delete the whole client — name, stage,
              // money, every deliverable and note — with no way back. Lost
              // a real client that way. A confirm is cheap; losing a
              // client's history to a mis-tap isn't.
              if (window.confirm(`Delete ${client.name}? This removes everything — stage, money, deliverables, notes. Can't be undone.`)) {
                actions.deleteClient(client.id);
                onClose();
              }
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
          {deliverableGroups.map((g, gi) => {
            const groupDone = g.items.filter((d) => d.done).length;
            const groupTotal = g.items.length;
            const groupPct = groupTotal ? Math.round((groupDone / groupTotal) * 100) : 0;
            const expanded = !g.category || expandedCategories.has(g.category);
            return (
              <div key={gi}>
                {g.category && (
                  <button
                    onClick={() =>
                      setExpandedCategories((cur) => {
                        const next = new Set(cur);
                        if (next.has(g.category!)) next.delete(g.category!);
                        else next.add(g.category!);
                        return next;
                      })
                    }
                    className="flex items-center justify-between w-full"
                    style={{ marginTop: gi > 0 ? 14 : 0, marginBottom: 4, padding: '2px 0' }}
                  >
                    <span className="flex items-center gap-1">
                      {expanded ? <ChevronDown size={12} color={C.teal} /> : <ChevronRight size={12} color={C.teal} />}
                      <span style={{ fontSize: 10, letterSpacing: '0.1em', color: C.teal, fontWeight: 700 }} className="uppercase">
                        {g.category}
                      </span>
                    </span>
                    <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 600 }}>
                      {groupDone}/{groupTotal} · {groupPct}%
                    </span>
                  </button>
                )}
                {expanded &&
                  g.items.map((d) => (
                    <div key={d.id} className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
                      <button
                        onClick={() => actions.toggleDeliverable(client.id, d.id)}
                        className="shrink-0 rounded-md flex items-center justify-center"
                        style={{ width: 20, height: 20, marginTop: 1, border: `1.5px solid ${d.done ? C.teal : C.line}`, background: d.done ? C.teal : 'transparent' }}
                      >
                        {d.done && <Check size={12} color={C.white} strokeWidth={3} />}
                      </button>
                      <span className="flex-1">
                        <span
                          style={{ fontSize: 13.5, lineHeight: 1.35, color: d.done ? C.muted : C.ink, textDecoration: d.done ? 'line-through' : 'none' }}
                        >
                          {d.text}
                        </span>
                        {(d.price || d.deadline) && (
                          <span style={{ display: 'block', fontSize: 11, color: C.muted, marginTop: 2 }}>
                            {[d.price, d.deadline].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                      <button onClick={() => actions.deleteDeliverable(client.id, d.id)} style={{ color: C.line }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
              </div>
            );
          })}

          <div className="flex gap-1.5 mt-4 mb-3">
            {(
              [
                ['one', 'Add one'],
                ['paste', 'Paste quote'],
                ['tpl', 'Templates'],
                ['upload', 'Upload doc']
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
                    actions.addDeliverables(client.id, [{ text: one.trim() }]);
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
                    actions.addDeliverables(client.id, [{ text: one.trim() }]);
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
                        onClick={() => actions.addDeliverables(client.id, s.steps.map((text) => ({ text })), s.name)}
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
          {mode === 'upload' && (
            <div>
              {!reviewItems && (
                <label
                  className="w-full flex flex-col items-center justify-center gap-2 rounded-xl cursor-pointer"
                  style={{ height: 96, border: `1px dashed ${C.line}`, color: C.muted }}
                >
                  {uploadStatus === 'loading' ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Upload size={18} />
                  )}
                  <span style={{ fontSize: 12.5 }}>
                    {uploadStatus === 'loading' ? 'Reading the file…' : 'Tap to upload a quote (PDF or Word)'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    disabled={uploadStatus === 'loading'}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) uploadQuoteDoc(file);
                    }}
                  />
                </label>
              )}
              {uploadStatus === 'error' && (
                <div style={{ fontSize: 12, color: C.orange, marginTop: 8 }}>{uploadError}</div>
              )}
              {reviewItems && (
                <div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>
                    Nothing&apos;s saved yet — review what got pulled out, fix anything wrong, uncheck what shouldn&apos;t be here.
                  </div>
                  <div className="space-y-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {reviewItems.map((it, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-xl p-2.5" style={{ border: `1px solid ${C.line}` }}>
                        <button
                          onClick={() =>
                            setReviewItems((cur) => cur!.map((x, xi) => (xi === i ? { ...x, include: !x.include } : x)))
                          }
                          className="shrink-0 rounded-md flex items-center justify-center"
                          style={{ width: 20, height: 20, marginTop: 1, border: `1.5px solid ${it.include ? C.teal : C.line}`, background: it.include ? C.teal : 'transparent' }}
                        >
                          {it.include && <Check size={12} color={C.white} strokeWidth={3} />}
                        </button>
                        <div className="flex-1 space-y-1.5">
                          <input
                            value={it.text}
                            onChange={(e) =>
                              setReviewItems((cur) => cur!.map((x, xi) => (xi === i ? { ...x, text: e.target.value } : x)))
                            }
                            className="w-full rounded-lg px-2 outline-none"
                            style={{ height: 30, fontSize: 12.5, border: `1px solid ${C.line}`, color: C.ink }}
                          />
                          <div className="flex gap-1.5">
                            <input
                              value={it.price}
                              onChange={(e) =>
                                setReviewItems((cur) => cur!.map((x, xi) => (xi === i ? { ...x, price: e.target.value } : x)))
                              }
                              placeholder="Price"
                              className="flex-1 rounded-lg px-2 outline-none"
                              style={{ height: 26, fontSize: 11.5, border: `1px solid ${C.line}`, color: C.muted }}
                            />
                            <input
                              value={it.deadline}
                              onChange={(e) =>
                                setReviewItems((cur) => cur!.map((x, xi) => (xi === i ? { ...x, deadline: e.target.value } : x)))
                              }
                              placeholder="Deadline"
                              className="flex-1 rounded-lg px-2 outline-none"
                              style={{ height: 26, fontSize: 11.5, border: `1px solid ${C.line}`, color: C.muted }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setReviewItems(null)}
                      className="rounded-xl"
                      style={{ height: 40, padding: '0 16px', border: `1px solid ${C.line}`, color: C.muted, fontSize: 13.5, fontWeight: 600 }}
                    >
                      Discard
                    </button>
                    <button
                      onClick={commitReviewed}
                      className="flex-1 rounded-xl"
                      style={{ height: 40, background: C.teal, color: C.white, fontSize: 13.5, fontWeight: 600 }}
                    >
                      Add {reviewItems.filter((it) => it.include).length} to checklist
                    </button>
                  </div>
                </div>
              )}
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
