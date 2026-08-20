'use client';

import { Check, Trash2 } from 'lucide-react';
import { C } from '@/lib/theme';
import { Client, Task } from '@/lib/types';

export function TaskRow({
  task,
  client,
  onToggle,
  onDelete,
  overdue
}: {
  task: Task;
  client?: Client;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  overdue?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
      <button
        onClick={() => onToggle(task.id)}
        className="shrink-0 rounded-full flex items-center justify-center transition-colors"
        style={{ width: 22, height: 22, marginTop: 1, border: `1.5px solid ${task.done ? C.teal : C.line}`, background: task.done ? C.teal : 'transparent' }}
      >
        {task.done && <Check size={13} color={C.white} strokeWidth={3} />}
      </button>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 14, color: task.done ? C.muted : C.ink, textDecoration: task.done ? 'line-through' : 'none', lineHeight: 1.35 }}>
          {task.title}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {client && <span style={{ fontSize: 11, color: C.teal, fontWeight: 600 }}>{client.name}</span>}
          {overdue && (
            <span style={{ fontSize: 10, color: C.orange, fontWeight: 700, letterSpacing: '0.06em' }} className="uppercase">
              Overdue · {task.date.slice(8)}/{task.date.slice(5, 7)}
            </span>
          )}
        </div>
      </div>
      <button onClick={() => onDelete(task.id)} className="shrink-0 p-1" style={{ color: C.line }}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
