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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/data');
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || 'load failed');
        setDataRaw(out.state);
        setUpdatedAt(out.updatedAt);
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
      return;
    }
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/data', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('save failed');
        setUpdatedAt(new Date().toISOString());
        setStatus('ok');
      } catch (e) {
        setStatus('offline');
      }
    }, 500);
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
          {tab === 'today' && <TodayView data={data} actions={actions} />}
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
