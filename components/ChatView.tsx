'use client';

import { useState } from 'react';
import { ArrowUp, Check, Loader2, MessageCircle, X } from 'lucide-react';
import { C, DISPLAY } from '@/lib/theme';
import { Actions } from '@/lib/actions';
import { Empty } from './Primitives';

interface ToolCallLogEntry {
  tool: string;
  args: any;
  ok: boolean;
  message: string;
  result: any;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallLogEntry[];
}

export function ChatView({ onMutated, onOpenClient, actions }: { onMutated: () => void; onOpenClient: (id: string) => void; actions: Actions }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const send = async (retryText?: string) => {
    const text = (retryText ?? input).trim();
    if (!text || busy) return;
    const nextMessages: ChatMessage[] = retryText ? messages : [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: nextMessages.slice(-8).map((m) => ({ role: m.role, content: m.content }))
        })
      });
      const out = await res.json();
      if (!res.ok || out.error) {
        setErr(out.error || 'Could not reach the assistant. It may be offline.');
        return;
      }
      setMessages((cur) => [...cur, { role: 'assistant', content: out.reply, toolCalls: out.toolCalls }]);
      if ((out.toolCalls as ToolCallLogEntry[]).some((t) => t.ok && t.tool !== 'get_schedule')) {
        onMutated();
      }
    } catch {
      setErr('Could not reach the assistant. It may be offline.');
    }
    setBusy(false);
  };

  const retry = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) send(lastUser.content);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle size={16} color={C.teal} />
        <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, color: C.ink }}>Chat</span>
      </div>

      {messages.length === 0 && !busy && (
        <Empty>Ask about your week, add a task, or update a client — this talks to your own self-hosted assistant, not a paid API.</Empty>
      )}

      <div className="space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className="rounded-2xl px-3.5 py-2.5"
              style={{ maxWidth: '85%', background: m.role === 'user' ? C.ink : C.white, border: m.role === 'user' ? 'none' : `1px solid ${C.line}` }}
            >
              <div style={{ fontSize: 13.5, lineHeight: 1.4, color: m.role === 'user' ? C.white : C.ink }}>{m.content}</div>
              {m.toolCalls?.map((tc, ti) => (
                <div key={ti} className="rounded-xl px-2.5 py-1.5 mt-2 flex items-center justify-between gap-2" style={{ background: tc.ok ? C.tealDeep : C.orangeSoft }}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    {tc.ok && <Check size={12} color="#8FBDBB" strokeWidth={3} className="shrink-0" />}
                    <span style={{ fontSize: 11.5, color: tc.ok ? C.white : C.orange }} className="truncate">
                      {tc.message}
                    </span>
                  </div>
                  {tc.ok && tc.tool === 'add_task' && tc.result?.taskId && (
                    <button
                      onClick={() => {
                        actions.deleteTask(tc.result.taskId);
                        onMutated();
                      }}
                      className="shrink-0"
                      style={{ fontSize: 11, color: '#8FBDBB', fontWeight: 600, textDecoration: 'underline' }}
                    >
                      Undo
                    </button>
                  )}
                  {tc.ok && tc.tool === 'update_client' && tc.result?.clientId && (
                    <button
                      onClick={() => onOpenClient(tc.result.clientId)}
                      className="shrink-0"
                      style={{ fontSize: 11, color: '#8FBDBB', fontWeight: 600, textDecoration: 'underline' }}
                    >
                      Correct
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-3.5 py-2.5" style={{ background: C.white, border: `1px solid ${C.line}` }}>
              <Loader2 size={14} color={C.muted} className="animate-spin" />
            </div>
          </div>
        )}
      </div>

      {err && (
        <div className="rounded-xl px-3 py-2 flex items-center justify-between gap-2" style={{ background: C.orangeSoft, border: `1px solid ${C.orange}44` }}>
          <span style={{ fontSize: 12.5, color: C.orange }}>{err}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={retry} style={{ fontSize: 11.5, color: C.orange, fontWeight: 600, textDecoration: 'underline' }}>
              Retry
            </button>
            <button onClick={() => setErr('')}>
              <X size={13} color={C.orange} />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-2xl p-1.5" style={{ background: C.white, border: `1px solid ${C.line}` }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="What's happening next week?"
          className="flex-1 outline-none min-w-0 px-2"
          style={{ fontSize: 14, color: C.ink, background: 'transparent' }}
        />
        <button onClick={() => send()} disabled={busy} className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 38, height: 38, background: busy ? C.muted : C.ink }}>
          {busy ? <Loader2 size={16} color={C.white} className="animate-spin" /> : <ArrowUp size={17} color={C.white} strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  );
}
