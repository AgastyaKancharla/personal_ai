'use client';

import { useRef, useState } from 'react';
import { ArrowUp, Loader2, Sparkles, X, Check } from 'lucide-react';
import { C } from '@/lib/theme';
import { Client, QuickAddAction } from '@/lib/types';

const AUTO_ACCEPT_MS = 8000;

interface Filed {
  logId: string | null;
  summary: string;
}

export function QuickAdd({ clients, onApply }: { clients: Client[]; onApply: (actions: QuickAddAction[]) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [filed, setFiled] = useState<Filed | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [err, setErr] = useState('');

  const acceptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const correctionOf = useRef<string | null>(null);
  const lastNote = useRef('');

  const clearAcceptTimer = () => {
    if (acceptTimer.current) clearTimeout(acceptTimer.current);
    acceptTimer.current = null;
  };

  const patchLog = async (id: string, body: { accepted: boolean; corrected?: QuickAddAction[] }) => {
    try {
      await fetch(`/api/parse-log/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      // best-effort — losing one label isn't worth surfacing an error for
    }
  };

  const notRight = () => {
    if (!filed?.logId) return;
    clearAcceptTimer();
    patchLog(filed.logId, { accepted: false });
    correctionOf.current = filed.logId;
    setFlagged(true);
    setFiled(null);
    setText(lastNote.current); // one tap re-opens the note for retyping
  };

  const run = async () => {
    const note = text.trim();
    if (!note || busy) return;
    lastNote.current = note;
    setBusy(true);
    setErr('');
    setFiled(null);
    clearAcceptTimer();
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
        setFlagged(false);
        setFiled({ logId: out.logId ?? null, summary: out.summary || `Filed ${out.actions.length} update${out.actions.length > 1 ? 's' : ''}` });
        setText('');

        if (correctionOf.current) {
          const originalId = correctionOf.current;
          correctionOf.current = null;
          patchLog(originalId, { accepted: false, corrected: out.actions });
        }

        if (out.logId) {
          acceptTimer.current = setTimeout(() => {
            patchLog(out.logId, { accepted: true });
          }, AUTO_ACCEPT_MS);
        }
      }
    } catch (e) {
      setErr('That did not go through. Send it again.');
    }
    setBusy(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 pt-8" style={{ background: `linear-gradient(to top, ${C.paper} 58%, transparent)` }}>
      <div className="mx-auto" style={{ maxWidth: 480 }}>
        {filed && (
          <div className="rounded-xl px-3 py-2 mb-2 flex items-center justify-between gap-2" style={{ background: C.tealDeep }}>
            <div className="flex items-center gap-2 min-w-0">
              <Check size={13} color="#8FBDBB" strokeWidth={3} className="shrink-0" />
              <span style={{ fontSize: 12.5, color: C.white }} className="truncate">
                {filed.summary}
              </span>
            </div>
            {filed.logId && (
              <button onClick={notRight} className="shrink-0" style={{ fontSize: 11.5, color: '#8FBDBB', fontWeight: 600, textDecoration: 'underline' }}>
                Not right
              </button>
            )}
          </div>
        )}
        {flagged && (
          <div className="rounded-xl px-3 py-2 mb-2" style={{ background: C.orangeSoft, border: `1px solid ${C.orange}44` }}>
            <span style={{ fontSize: 12.5, color: C.orange }}>Flagged. Retype it below and it'll replace what was filed.</span>
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
