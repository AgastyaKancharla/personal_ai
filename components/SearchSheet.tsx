'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { C, DISPLAY } from '@/lib/theme';
import { STAGES, stageIndex } from '@/lib/catalogue';
import { searchAll } from '@/lib/search';
import { TrackerState } from '@/lib/types';
import { Actions } from '@/lib/actions';
import { Empty, Eyebrow } from './Primitives';
import { TaskRow } from './TaskRow';

export function SearchSheet({ data, actions, onClose }: { data: TrackerState; actions: Actions; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const byId = useMemo(() => Object.fromEntries(data.clients.map((c) => [c.id, c])), [data.clients]);
  const results = searchAll(data, query);
  const hasQuery = query.trim().length > 0;

  const openClient = (id: string) => {
    actions.openClient(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: C.paper }}>
      <div className="mx-auto px-4 pt-4 pb-16" style={{ maxWidth: 480 }}>
        <button onClick={onClose} className="flex items-center gap-1 mb-4" style={{ color: C.muted, fontSize: 13 }}>
          <ChevronLeft size={16} /> Back
        </button>
        <div style={{ fontFamily: DISPLAY, fontSize: 25, fontWeight: 800, color: C.ink }}>Search</div>

        <div className="mt-4 flex items-center gap-2 rounded-xl px-3" style={{ height: 44, background: C.white, border: `1px solid ${C.line}` }}>
          <Search size={15} color={C.muted} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, tags, clients…"
            className="flex-1 outline-none"
            style={{ fontSize: 14, color: C.ink, background: 'transparent' }}
          />
        </div>

        {!hasQuery && (
          <div className="mt-8">
            <Empty>Start typing to search across every task and client.</Empty>
          </div>
        )}

        {hasQuery && results.tasks.length === 0 && results.clients.length === 0 && (
          <div className="mt-8">
            <Empty>Nothing matches &quot;{query.trim()}&quot;.</Empty>
          </div>
        )}

        {results.clients.length > 0 && (
          <div className="mt-5 rounded-2xl p-4" style={{ background: C.white, border: `1px solid ${C.line}` }}>
            <Eyebrow>Clients — {results.clients.length}</Eyebrow>
            {results.clients.map((c) => (
              <button
                key={c.id}
                onClick={() => openClient(c.id)}
                className="w-full flex items-center justify-between gap-3 py-2.5 text-left"
                style={{ borderBottom: `1px solid ${C.line}` }}
              >
                <div className="min-w-0">
                  <div style={{ fontSize: 14, color: C.ink }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {STAGES[stageIndex(c.stage)].label}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </div>
                </div>
                <ChevronRight size={15} color={C.muted} className="shrink-0" />
              </button>
            ))}
          </div>
        )}

        {results.tasks.length > 0 && (
          <div className="mt-5 rounded-2xl p-4" style={{ background: C.white, border: `1px solid ${C.line}` }}>
            <Eyebrow>Tasks — {results.tasks.length}</Eyebrow>
            {results.tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                client={byId[t.clientId || '']}
                clients={data.clients}
                onToggle={actions.toggleTask}
                onDelete={actions.deleteTask}
                onUpdate={actions.updateTask}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
