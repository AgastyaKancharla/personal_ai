'use client';

import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { C, DISPLAY } from '@/lib/theme';
import { TrackerState } from '@/lib/types';
import { Eyebrow } from './Primitives';

export function DataSheet({
  data,
  updatedAt,
  onRestore,
  onClose
}: {
  data: TrackerState;
  updatedAt: string | null;
  onRestore: (state: TrackerState) => void;
  onClose: () => void;
}) {
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const json = JSON.stringify(data);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setMsg('Copied. Paste it somewhere safe.');
    } catch (e) {
      setMsg('Copy blocked here — tap the box and copy it by hand.');
    }
  };

  const restore = () => {
    try {
      const p = JSON.parse(paste.trim());
      if (!Array.isArray(p.clients) || !Array.isArray(p.tasks)) {
        setMsg('That backup is missing clients or tasks.');
        return;
      }
      onRestore(p);
      setPaste('');
      setMsg(`Restored ${p.clients.length} clients and ${p.tasks.length} tasks.`);
    } catch (e) {
      setMsg('That is not a valid backup. Copy the whole block, brackets included.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: C.paper }}>
      <div className="mx-auto px-4 pt-4 pb-16" style={{ maxWidth: 480 }}>
        <button onClick={onClose} className="flex items-center gap-1 mb-4" style={{ color: C.muted, fontSize: 13 }}>
          <ChevronLeft size={16} /> Back
        </button>
        <div style={{ fontFamily: DISPLAY, fontSize: 25, fontWeight: 800, color: C.ink }}>Your data</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
          {data.clients.length} clients · {data.tasks.length} tasks
          {updatedAt ? ` · last saved ${new Date(updatedAt).toLocaleString('en-IN')}` : ''}
        </div>

        {msg && (
          <div className="rounded-xl px-3 py-2 mt-4" style={{ background: C.tealSoft }}>
            <span style={{ fontSize: 12.5, color: C.tealDeep }}>{msg}</span>
          </div>
        )}

        <div className="mt-5 rounded-2xl p-4" style={{ background: C.white, border: `1px solid ${C.line}` }}>
          <Eyebrow>Take a backup</Eyebrow>
          <textarea
            readOnly
            value={json}
            rows={4}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            className="w-full rounded-xl p-3 outline-none"
            style={{ fontSize: 10.5, border: `1px solid ${C.line}`, color: C.muted, resize: 'none' }}
          />
          <button onClick={copy} className="w-full rounded-xl mt-2" style={{ height: 42, background: C.ink, color: C.white, fontSize: 13.5, fontWeight: 600 }}>
            Copy backup
          </button>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.45 }}>
            Everything here is already synced to your Supabase database on every change — this is just an extra offline copy.
          </div>
        </div>

        <div className="mt-4 rounded-2xl p-4" style={{ background: C.white, border: `1px solid ${C.line}` }}>
          <Eyebrow>Restore from a backup</Eyebrow>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={4}
            placeholder="Paste a backup here"
            className="w-full rounded-xl p-3 outline-none"
            style={{ fontSize: 11, border: `1px solid ${C.line}`, color: C.ink, resize: 'none' }}
          />
          <button onClick={restore} className="w-full rounded-xl mt-2" style={{ height: 42, background: C.teal, color: C.white, fontSize: 13.5, fontWeight: 600 }}>
            Restore this backup
          </button>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>This replaces everything currently in the tracker and saves immediately.</div>
        </div>
      </div>
    </div>
  );
}
