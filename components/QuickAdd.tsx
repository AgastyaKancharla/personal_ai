'use client';

import { useState } from 'react';
import { ArrowUp, Loader2, Sparkles, X, Check } from 'lucide-react';
import { C } from '@/lib/theme';
import { Client, QuickAddAction } from '@/lib/types';

export function QuickAdd({ clients, onApply }: { clients: Client[]; onApply: (actions: QuickAddAction[]) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const run = async () => {
    const note = text.trim();
    if (!note || busy) return;
    setBusy(true);
    setErr('');
    setFlash(null);
    try {
      const res = await fetch('/api/quick-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, clients })
      });
      const out = await res.json();
      if (!res.ok) {
        setErr(out.error || 'That did not go through. Send it again.');
      } else {
        onApply(out.actions as QuickAddAction[]);
        setFlash(out.summary || `Filed ${out.actions.length} update${out.actions.length > 1 ? 's' : ''}`);
        setText('');
        setTimeout(() => setFlash(null), 4500);
      }
    } catch (e) {
      setErr('That did not go through. Send it again.');
    }
    setBusy(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 pt-8" style={{ background: `linear-gradient(to top, ${C.paper} 58%, transparent)` }}>
      <div className="mx-auto" style={{ maxWidth: 480 }}>
        {flash && (
          <div className="rounded-xl px-3 py-2 mb-2 flex items-center gap-2" style={{ background: C.tealDeep }}>
            <Check size={13} color="#8FBDBB" strokeWidth={3} />
            <span style={{ fontSize: 12.5, color: C.white }}>{flash}</span>
          </div>
        )}
        {err && (
          <div className="rounded-xl px-3 py-2 mb-2 flex items-center justify-between gap-2" style={{ background: C.orangeSoft, border: `1px solid ${C.orange}44` }}>
            <span style={{ fontSize: 12.5, color: C.orange }}>{err}</span>
            <button onClick={() => setErr('')}>
              <X size={13} color={C.orange} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-2xl p-1.5" style={{ background: C.white, border: `1px solid ${C.line}`, boxShadow: '0 8px 24px rgba(10,36,34,0.12)' }}>
          <Sparkles size={15} color={C.orange} style={{ marginLeft: 7 }} className="shrink-0" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="Just type it — it files itself"
            className="flex-1 outline-none min-w-0"
            style={{ fontSize: 14, color: C.ink, background: 'transparent' }}
          />
          <button onClick={run} disabled={busy} className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 38, height: 38, background: busy ? C.muted : C.ink }}>
            {busy ? <Loader2 size={16} color={C.white} className="animate-spin" /> : <ArrowUp size={17} color={C.white} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </div>
  );
}
