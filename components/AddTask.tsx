'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { C } from '@/lib/theme';
import { Client } from '@/lib/types';

export function AddTask({
  date,
  clients,
  onAdd
}: {
  date: string;
  clients: Client[];
  onAdd: (title: string, clientId: string | null, date: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    onAdd(title.trim(), clientId || null, date);
    setTitle('');
  };

  return (
    <div className="flex gap-2 mt-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Add a task…"
        className="flex-1 rounded-xl px-3 outline-none"
        style={{ fontSize: 14, height: 42, background: C.white, border: `1px solid ${C.line}`, color: C.ink }}
      />
      {clients.length > 0 && (
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded-xl px-2 outline-none"
          style={{ fontSize: 12, height: 42, maxWidth: 92, background: C.white, border: `1px solid ${C.line}`, color: C.muted }}
        >
          <option value="">No client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <button onClick={submit} className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 42, height: 42, background: C.teal }}>
        <Plus size={18} color={C.white} strokeWidth={2.5} />
      </button>
    </div>
  );
}
