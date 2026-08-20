'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Database, Layers, LogOut, Sun, Users } from 'lucide-react';
import { C, DISPLAY } from '@/lib/theme';
import { TrackerState } from '@/lib/types';
import { makeActions } from '@/lib/actions';
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
const CACHE_KEY = 'personal-ai:last-saved';

type Cached = { state: TrackerState; updatedAt: string };

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

function writeCache(state: TrackerState, updatedAt: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ state, updatedAt }));
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

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boot = useRef(true);
  const forceResave = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/data');
        if (res.status === 401) {
          router.replace('/login');
          setReady(true);
          return;
        }
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || 'load failed');

        const cached = readCache();
        // A read immediately after a write can occasionally come back
        // stale (seen live in production: a save completes, and a load a
        // few seconds later comes back without it, even though the row
        // was already correctly written). Never let a technically-200
        // but stale read regress onto state we already know is good —
        // trust whichever side has the newer timestamp, and if that's
        // the local cache, push it back up so the server catches up too.
        if (cached && (!out.updatedAt || new Date(cached.updatedAt) > new Date(out.updatedAt))) {
          setDataRaw(cached.state);
          setUpdatedAt(cached.updatedAt);
          forceResave.current = true;
        } else {
          setDataRaw(out.state);
          setUpdatedAt(out.updatedAt);
          writeCache(out.state, out.updatedAt || new Date().toISOString());
        }
        setStatus('ok');
      } catch (e) {
        setStatus('offline');
      }
      setReady(true);
    })();
  }, [router]);

  const setData = (updater: (d: TrackerState) => TrackerState) => {
    setDataRaw((d) => updater(d));
  };

  useEffect(() => {
    if (!ready) return;
    if (boot.current) {
      boot.current = false;
      // Normally the very first data-effect run is just the mount load
      // settling in, not a real edit — nothing to save. The one exception
      // is when that load decided the server's own read was stale and
      // substituted our local cache instead; that needs to reach the
      // server so it catches up, so fall through to schedule a save.
      if (!forceResave.current) return;
      forceResave.current = false;
    }
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);

    // keepalive is reserved for the unload flush below — it shares the
    // browser's small (~64KB) total keepalive request-body quota across
    // every in-flight request, and this save ships the entire tracker
    // state, so forcing it on every normal debounced save risks silently
    // failing once a board's notes/deliverables grow past that budget.
    const doSave = (opts?: { keepalive?: boolean }) =>
      fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: !!opts?.keepalive
      });

    // A refresh, tab close, or app switch cancels the pending setTimeout
    // outright, silently dropping whatever the 500ms debounce hadn't sent
    // yet — that's the "edited a client, refreshed, and it was gone" bug.
    // keepalive lets the browser finish this request after the page starts
    // unloading; pagehide/visibilitychange fire even when a hard refresh
    // never gives beforeunload a chance to run (common on mobile). Cache
    // is written synchronously before the request so even an unobserved
    // (page-gone) response still leaves the next load with the right data.
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        writeCache(data, new Date().toISOString());
        doSave({ keepalive: true });
      }
    };
    const flushIfHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flushIfHidden);

    timer.current = setTimeout(async () => {
      timer.current = null;
      try {
        const res = await doSave();
        if (!res.ok) throw new Error('save failed');
        const savedAt = new Date().toISOString();
        setUpdatedAt(savedAt);
        writeCache(data, savedAt);
        setStatus('ok');
      } catch (e) {
        setStatus('offline');
      }
    }, 500);

    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flushIfHidden);
    };
  }, [data, ready]);

  const actions = makeActions(setData, setOpenId);

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
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
          {tab === 'today' && <TodayView data={data} actions={actions} onGotoClients={() => setTab('clients')} />}
          {tab === 'week' && <WeekView data={data} actions={actions} />}
          {tab === 'month' && <MonthView data={data} />}
          {tab === 'clients' && <ClientsView data={data} actions={actions} />}
        </div>
      </div>

      <QuickAdd clients={data.clients} onApply={actions.applyActions} />
      {showData && <DataSheet data={data} updatedAt={updatedAt} onRestore={(p) => { setDataRaw(p); setShowData(false); }} onClose={() => setShowData(false)} />}
      {openClient && <ClientSheet client={openClient} actions={actions} onClose={() => setOpenId(null)} />}
    </div>
  );
}
