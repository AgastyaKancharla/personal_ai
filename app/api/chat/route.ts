import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, readTrackerState, writeTrackerState } from '@/lib/supabase';
import { applyOp, Operation } from '@/lib/stateOps';
import { today, dowOf, parseIso } from '@/lib/dates';
import { getSchedule, buildAddTaskOp, buildUpdateClientOps, Period } from '@/lib/chatTools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TOOL_ROUNDS = 3;
const REQUEST_TIMEOUT_MS = 30000;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

interface ToolCallLogEntry {
  tool: string;
  args: unknown;
  ok: boolean;
  message: string;
  result: unknown;
}

const TOOLS_SCHEMA = [
  {
    type: 'function',
    function: {
      name: 'get_schedule',
      description: 'Read-only. Summarize tasks, overdue items and client follow-ups due for a period.',
      parameters: {
        type: 'object',
        properties: { period: { type: 'string', enum: ['today', 'this_week', 'next_week', 'this_month'] } },
        required: ['period']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_task',
      description: 'Add a new task/to-do, optionally linked to an existing client by name.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          clientName: { type: 'string', description: 'Optional; must match an existing client' }
        },
        required: ['title', 'date']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_client',
      description: "Update an existing client's stage, quote value, advance, notes, or next follow-up date. Only the fields given change.",
      parameters: {
        type: 'object',
        properties: {
          clientName: { type: 'string' },
          stage: { type: 'string', enum: ['cold', 'interested', 'meeting', 'finalised', 'quoted', 'advance', 'building', 'delivered'] },
          quoteValue: { type: 'number' },
          advance: { type: 'number' },
          notes: { type: 'string' },
          nextFollowUp: { type: 'string', description: 'YYYY-MM-DD' }
        },
        required: ['clientName']
      }
    }
  }
] as const;

function systemPrompt(): string {
  const t = today();
  const dow = dowOf(parseIso(t));
  return [
    `Today is ${dow}, ${t} (YYYY-MM-DD). Resolve any relative date ("tomorrow", "next week", a weekday name) against this.`,
    'Never guess which client is meant. If a name is ambiguous or unrecognized, say so plainly instead of calling a tool with a guess.',
    'Always call get_schedule before answering any question about what is due, upcoming, or overdue — do not answer from memory.',
    'After a tool result comes back, summarize it in plain language for the founder; do not just repeat the raw JSON.'
  ].join(' ');
}

async function executeToolCall(name: string, args: any): Promise<ToolCallLogEntry> {
  const supabase = supabaseServer();

  if (name === 'get_schedule') {
    // Fresh read even for a read-only query — no client-supplied or
    // model-supplied state is ever trusted, same rule as every write path.
    const state = await readTrackerState(supabase);
    const period = args?.period as Period;
    const summary = getSchedule(state, period);
    const message = `${period.replace('_', ' ')} (${summary.startIso} to ${summary.endIso}): ${summary.totalCount} task(s), ${summary.doneCount} done, ${summary.overdueCount} overdue, ${summary.followUpsDue.length} follow-up(s) due.`;
    return { tool: name, args, ok: true, message, result: summary };
  }

  if (name === 'add_task') {
    const state = await readTrackerState(supabase);
    const { op, note } = buildAddTaskOp(state.clients, args);
    const next = applyOp(state, op);
    await writeTrackerState(supabase, next);
    return { tool: name, args, ok: true, message: note, result: { taskId: op.type === 'addTask' ? op.id : null } };
  }

  if (name === 'update_client') {
    const state = await readTrackerState(supabase);
    const plan = buildUpdateClientOps(state.clients, args);
    if (!plan.ok) {
      return { tool: name, args, ok: false, message: plan.note, result: { clientId: plan.clientId } };
    }
    const next = plan.ops.reduce((s: ReturnType<typeof applyOp>, op: Operation) => applyOp(s, op), state);
    await writeTrackerState(supabase, next);
    return { tool: name, args, ok: true, message: plan.note, result: { clientId: plan.clientId } };
  }

  return { tool: name, args, ok: false, message: `Unknown tool "${name}".`, result: null };
}

async function callBrain(messages: ChatMessage[], toolChoice: 'auto' | 'none', apiUrl: string, apiKey: string, model: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        tools: toolChoice === 'auto' ? TOOLS_SCHEMA : undefined,
        tool_choice: toolChoice,
        temperature: 0.2,
        max_tokens: 512
      }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Brain server returned ${res.status}`);
    const out = await res.json();
    return out.choices[0].message;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : [];

  if (!message) {
    return NextResponse.json({ error: 'Empty message.' }, { status: 400 });
  }

  const apiUrl = process.env.BRAIN_API_URL;
  const apiKey = process.env.BRAIN_API_KEY;
  if (!apiUrl || !apiKey) {
    return NextResponse.json({ error: 'BRAIN_API_URL/BRAIN_API_KEY are not configured.' }, { status: 500 });
  }
  const model = process.env.BRAIN_MODEL_NAME || 'qwen2.5-3b-instruct';

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt() },
    ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message }
  ];

  const toolCalls: ToolCallLogEntry[] = [];

  try {
    let round = 0;
    let assistantMessage = await callBrain(messages, 'auto', apiUrl, apiKey, model);

    while (assistantMessage.tool_calls?.length && round < MAX_TOOL_ROUNDS) {
      messages.push({ role: 'assistant', content: assistantMessage.content || '', tool_calls: assistantMessage.tool_calls });

      for (const call of assistantMessage.tool_calls) {
        let args: any = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          // malformed tool-call args from the model — surface as a failed call, not a crash
        }
        const result = await executeToolCall(call.function.name, args);
        toolCalls.push(result);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }

      round++;
      assistantMessage = await callBrain(messages, round < MAX_TOOL_ROUNDS ? 'auto' : 'none', apiUrl, apiKey, model);
    }

    return NextResponse.json({ reply: assistantMessage.content || '', toolCalls, error: null });
  } catch (err: any) {
    return NextResponse.json({ reply: '', toolCalls: [], error: 'Could not reach the assistant. It may be offline.' }, { status: 502 });
  }
}
