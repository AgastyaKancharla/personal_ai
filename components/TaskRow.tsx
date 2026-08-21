'use client';

import { useState } from 'react';
import { Check, Clock, Pencil, Repeat, Star, Trash2 } from 'lucide-react';
import { C } from '@/lib/theme';
import { formatTime } from '@/lib/dates';
import { Client, RecurrenceFreq, Task } from '@/lib/types';

export function TaskRow({
  task,
  client,
  clients,
  onToggle,
  onDelete,
  onUpdate,
  overdue
}: {
  task: Task;
  client?: Client;
  clients?: Client[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, patch: Partial<Pick<Task, 'title' | 'date' | 'clientId' | 'important' | 'recurrence' | 'time' | 'tags'>>) => void;
  overdue?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState(task.date);
  const [clientId, setClientId] = useState(task.clientId || '');
  const [repeat, setRepeat] = useState<'' | RecurrenceFreq>(task.recurrence?.freq || '');
  const [time, setTime] = useState(task.time || '');
  const [tagsInput, setTagsInput] = useState((task.tags || []).join(', '));

  const startEdit = () => {
    setTitle(task.title);
    setDate(task.date);
    setClientId(task.clientId || '');
    setRepeat(task.recurrence?.freq || '');
    setTime(task.time || '');
    setTagsInput((task.tags || []).join(', '));
    setEditing(true);
  };

  const save = () => {
    if (!title.trim() || !onUpdate) return;
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    onUpdate(task.id, {
      title: title.trim(),
      date,
      clientId: clientId || null,
      recurrence: repeat ? { freq: repeat } : undefined,
      time: time || undefined,
      tags: tags.length ? tags : undefined
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="py-2.5 space-y-2" style={{ borderBottom: `1px solid ${C.line}` }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="w-full rounded-xl px-3 outline-none"
          style={{ fontSize: 14, height: 38, background: C.white, border: `1px solid ${C.line}`, color: C.ink }}
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 rounded-xl px-2 outline-none"
            style={{ fontSize: 12, height: 36, minWidth: 0, background: C.white, border: `1px solid ${C.line}`, color: C.ink }}
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="flex-1 rounded-xl px-2 outline-none"
            style={{ fontSize: 12, height: 36, minWidth: 0, background: C.white, border: `1px solid ${C.line}`, color: C.ink }}
          />
        </div>
        <div className="flex gap-2">
          {clients && clients.length > 0 && (
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="flex-1 rounded-xl px-2 outline-none"
              style={{ fontSize: 12, height: 36, minWidth: 0, background: C.white, border: `1px solid ${C.line}`, color: C.muted }}
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as '' | RecurrenceFreq)}
            className="rounded-xl px-2 outline-none shrink-0"
            style={{ fontSize: 12, height: 36, minWidth: 0, width: 92, background: C.white, border: `1px solid ${C.line}`, color: C.muted }}
          >
            <option value="">No repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="Tags — comma separated"
          className="w-full rounded-xl px-3 outline-none"
          style={{ fontSize: 12, height: 34, background: C.white, border: `1px solid ${C.line}`, color: C.ink }}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={() => setEditing(false)} className="rounded-lg px-3" style={{ height: 32, fontSize: 12.5, color: C.muted, fontWeight: 600 }}>
            Cancel
          </button>
          <button onClick={save} className="rounded-lg px-3" style={{ height: 32, fontSize: 12.5, color: C.white, background: C.teal, fontWeight: 600 }}>
            Save
          </button>
        </div>
      </div>
    );
  }

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
          {task.time && (
            <span className="flex items-center gap-1" style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>
              <Clock size={10} />
              {formatTime(task.time)}
            </span>
          )}
          {client && <span style={{ fontSize: 11, color: C.teal, fontWeight: 600 }}>{client.name}</span>}
          {task.recurrence && (
            <span className="flex items-center gap-1" style={{ fontSize: 10.5, color: C.muted, fontWeight: 600 }}>
              <Repeat size={10} />
              {task.recurrence.freq}
            </span>
          )}
          {overdue && (
            <span style={{ fontSize: 10, color: C.orange, fontWeight: 700, letterSpacing: '0.06em' }} className="uppercase">
              Overdue · {task.date.slice(8)}/{task.date.slice(5, 7)}
            </span>
          )}
        </div>
        {task.tags && task.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-1.5">
            {task.tags.map((tag) => (
              <span key={tag} className="rounded-full px-2 py-0.5" style={{ fontSize: 10, color: C.muted, background: C.paper }}>
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
      {onUpdate && (
        <button onClick={() => onUpdate(task.id, { important: !task.important })} className="shrink-0 p-1" style={{ color: task.important ? C.orange : C.line }}>
          <Star size={14} fill={task.important ? C.orange : 'none'} />
        </button>
      )}
      {onUpdate && (
        <button onClick={startEdit} className="shrink-0 p-1" style={{ color: C.line }}>
          <Pencil size={13} />
        </button>
      )}
      <button onClick={() => onDelete(task.id)} className="shrink-0 p-1" style={{ color: C.line }}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
