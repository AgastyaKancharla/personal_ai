'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Database, Layers, LogOut, Sun, Users } from 'lucide-react';
import { C, DISPLAY } from '@/lib/theme';
import { TrackerState } from '@/lib/types';
import { makeActions } from '@/lib/actions';
import { Operation, applyOp } from '@/lib/stateOps';
import { TodayView } from '@/components/TodayView';
import { WeekView } from '@/components/WeekView';
import { MonthView } from '@/components/MonthView';
import { ClientsView } from '@/components/ClientsView';
import { ClientSheet } from '@/components/ClientSheet';
import { QuickAdd } from '@/components/QuickAdd';
import { DataSheet } from '@/components/DataSheet';

type Status = 'loading' | 'ok' | 'saving' | 'offline';
type Tab = 'today' | 'week' | 'month' | 'clients';

const EMPTY: TrackerState = { clients: [], tasks: [] };
const OPS_CACHE_KEY = 'personal-ai:pending-ops';

function readPersistedOps(): Operation[] {
  try {
    const raw = localStorage.getItem(OPS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Operation[]) : [];
  } catch {
    return [];
  }
}

function persistOps(ops: Operation[]) {
  try {
    if (ops.length) localStorage.setItem(OPS_CACHE_KEY, JSON.stringify(ops));
    else localStorage.removeItem(OPS_CACHE_KEY);
  } catch {
    // best-effort only — a full localStorage or private-browsing mode
    // shouldn't break saving to the actual database
  }
}

export default function Home() {
  const router = useRouter();
  const [data, setDataRaw] = useState<TrackerState>(EMPTY);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [openId, setOpenId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>('loading');
  const [showData, setShowData] = useState(false);

  // Every edit is a small operation (see lib/stateOps.ts), never a full
  // state snapshot. pendingOps queues them; the debounce below batches
  // rapid edits into one request. Whatever hasn't been sent yet is also
  // mirrored to localStorage so a hard refresh or crash mid-edit doesn't
  // lose it — on the next load it gets replayed against the server's
  // *current* row, same as any other operation, never overwriting
  // anything it doesn't name.
  const pendingOps = useRef<Operation[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const leftover = readPersistedOps();
      pendingOps.current = leftover;

      try {
        const res = await fetch('/api/data');
        if (res.status === 401) {
          router.replace('/login');
          setReady(true);
          return;
        }
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || 'load failed');

        // Replay any operations left over from an interrupted session on
        // top of the server's current state, so the UI shows what was
        // actually attempted last time, not a stale pre-edit view.
        const state = leftover.reduce((s, op) => applyOp(s, op), out.state as TrackerState);
        setDataRaw(state);
        setUpdatedAt(out.updatedAt);
        setStatus(leftover.length ? 'saving' : 'ok');
      } catch (e) {
        setStatus('offline');
      }
      setReady(true);
    })();
  }, [router]);

  const setData = (updater: (d: TrackerState) => TrackerState) => {
    setDataRaw((d) => updater(d));
  };

  const scheduleFlush = (immediate?: { keepalive: boolean }) => {
    if (timer.current) clearTimeout(timer.current);
    setStatus('saving');

    const flush = async (keepalive: boolean) => {
      timer.current = null;
      const toSend = pendingOps.current;
      if (!toSend.length) return;
      pendingOps.current = [];

      try {
        const res = await fetch('/api/data/ops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operations: toSend }),
          keepalive
        });
        const out = await res.json().catch(() => null);
        if (!res.ok) throw new Error(out?.error || 'save failed');

        // Only trust the server's authoritative result back into local
        // state if nothing new was queued while this request was in
        // flight — otherwise we'd stomp on an edit made in the meantime
        // (e.g. still typing). If something did come in, it's already
        // reflected in local state optimistically and will go out, and
        // reconcile, on the next flush.
        if (!pendingOps.current.length) {
          setDataRaw(out.state);
          setUpdatedAt(out.updatedAt);
          persistOps([]);
          setStatus('ok');
        } else {
          persistOps(pendingOps.current);
          setStatus('saving');
        }
      } catch (e) {
        // Put the unsent operations back so the next flush (or the
        // pagehide handler) retries them, in order, ahead of anything
        // queued since.
        pendingOps.current = [...toSend, ...pendingOps.current];
        persistOps(pendingOps.current);
        setStatus('offline');
      }
    };

    if (immediate) {
      flush(immediate.keepalive);
    } else {
      timer.current = setTimeout(() => flush(false), 500);
    }
  };

  useEffect(() => {
    if (!ready) return;
    // A refresh, tab close, or app switch cancels the pending setTimeout
    // outright, silently dropping whatever the 500ms debounce hadn't sent
    // yet — flush immediately (with keepalive so it survives an unloading
    // page) on pagehide/visibilitychange, same as the timed flush above.
    const flushNow = () => {
      if (pendingOps.current.length) scheduleFlush({ keepalive: true });
    };
    const flushIfHidden = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', flushIfHidden);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', flushIfHidden);
    };
  }, [ready]);

  const enqueue = (op: Operation) => {
    pendingOps.current = [...pendingOps.current, op];
    persistOps(pendingOps.current);
    scheduleFlush();
  };

  useEffect(() => {
    // Pick up any operations left over from an interrupted previous
    // session (see the mount effect above) once we're actually ready.
    if (ready && pendingOps.current.length) scheduleFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const actions = makeActions(setData, setOpenId, enqueue);

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
  };

  const restoreBackup = async (state: TrackerState) => {
    // Deliberate exception to "never send a full snapshot": the user
    // explicitly asked to replace everything with a backup they pasted in
    // themselves. Goes straight to the full-replace endpoint, not through
    // the operations queue — and anything still queued from before this
    // point is now stale (it was meant for the pre-restore state) and
    // must not be replayed on top of the restored data later.
    if (timer.current) clearTimeout(timer.current);
    pendingOps.current = [];
    persistOps([]);
    setDataRaw(state);
    setShowData(false);
    setStatus('saving');
    try {
      const res = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
      if (!res.ok) throw new Error('restore failed');
      const savedAt = new Date().toISOString();
      setUpdatedAt(savedAt);
      setStatus('ok');
    } catch (e) {
      setStatus('offline');
    }
  };

  const openClient = data.clients.find((c) => c.id === openId);
  const TABS: [Tab, string, typeof Sun][] = [
    ['today', 'Today', Sun],
    ['week', 'Week', CalendarDays],
    ['month', 'Month', Layers],
    ['clients', 'Clients', Users]
  ];

  if (!ready) {
    return (
      <div style={{ background: C.paper, minHeight: '100vh', color: C.muted, fontSize: 13 }} className="flex items-center justify-center">
        Loading your board…
      </div>
    );
  }

  return (
    <div style={{ background: C.paper, minHeight: '100vh' }}>
      <div className="mx-auto" style={{ maxWidth: 480 }}>
        <div className="sticky top-0 z-20 px-4 pt-4 pb-3" style={{ background: C.paper }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-baseline gap-1.5">
              <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em' }}>Personal AI</span>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: C.orange, display: 'inline-block' }} />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowData(true)} className="flex items-center gap-1.5">
                <Database size={11} color={status === 'offline' ? C.orange : C.muted} />
                <span
                  style={{ fontSize: 10, color: status === 'offline' ? C.orange : status === 'saving' ? C.muted : C.teal, letterSpacing: '0.08em', fontWeight: 600 }}
                  className="uppercase"
                >
                  {status === 'offline' ? 'Not synced' : status === 'saving' ? 'Saving' : 'Synced'}
                </span>
              </button>
              <button onClick={logout} title="Log out">
                <LogOut size={13} color={C.muted} />
              </button>
            </div>
          </div>
          <div className="flex gap-1 rounded-xl p-1" style={{ background: C.white, border: `1px solid ${C.line}` }}>
            {TABS.map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className="flex-1 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                style={{ height: 34, background: tab === k ? C.ink : 'transparent' }}
              >
                <Icon size={13} color={tab === k ? C.white : C.muted} />
                <span style={{ fontSize: 12, fontWeight: 600, color: tab === k ? C.white : C.muted }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-4" style={{ paddingBottom: 96 }}>
          {status === 'offline' && (
            <div className="rounded-2xl p-3 mb-4" style={{ background: C.orangeSoft, border: `1px solid ${C.orange}44` }}>
              <div style={{ fontSize: 12.5, color: C.orange, fontWeight: 600 }}>Not connected to your database</div>
              <div style={{ fontSize: 11.5, color: C.orange, marginTop: 3, lineHeight: 1.4 }}>
                Changes are held in this tab only. Reload once you&apos;re back online — nothing already saved has been lost.
              </div>
            </div>
          )}
          {tab === 'today' && <TodayView data={data} actions={actions} />}
          {tab === 'week' && <WeekView data={data} actions={actions} />}
          {tab === 'month' && <MonthView data={data} />}
          {tab === 'clients' && <ClientsView data={data} actions={actions} />}
        </div>
      </div>

      <QuickAdd clients={data.clients} onApply={actions.applyActions} />
      {showData && <DataSheet data={data} updatedAt={updatedAt} onRestore={restoreBackup} onClose={() => setShowData(false)} />}
      {openClient && <ClientSheet client={openClient} actions={actions} onClose={() => setOpenId(null)} />}
    </div>
  );
}
