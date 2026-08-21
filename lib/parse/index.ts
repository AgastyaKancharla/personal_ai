import { Action } from '../types';
import { ParseContext, ParseResult, Span } from './types';
import { matchMoney } from './money';
import { matchDate, isFutureDate } from './dates';
import { scanStageVerbs } from './stageVerbs';
import { resolveClient } from './clients';
import { matchService } from './services';
import { matchCompletion } from './completion';
import { matchNewClients } from './newClients';

export type { ParseContext, ParseResult } from './types';

function redact(text: string, spans: Span[]): string {
  const chars = text.split('');
  for (const [s, e] of spans) {
    for (let i = Math.max(0, s); i < Math.min(e, chars.length); i++) chars[i] = ' ';
  }
  return chars.join('').replace(/\s+/g, ' ').trim();
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function overlaps(a: Span, b: Span): boolean {
  return a[0] < b[1] && a[1] > b[0];
}

// The client's own name often ends up inside a completion phrase's captured
// text ("Sharma Dental site is live" -> item "Sharma Dental site") since the
// pattern doesn't know where the client mention ends. Strip it back out so
// `match` is left as just the deliverable/task fragment it's meant to be.
function stripClientName(item: string, clientName: string | null): string {
  if (!clientName) return item;
  const escaped = clientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let stripped = item.replace(new RegExp(escaped, 'i'), '').replace(/\s+/g, ' ').trim();
  // Removing the client name can leave a dangling connector word behind
  // ("website for X" -> "website for"); drop it too.
  stripped = stripped.replace(/^(for|to|from|with)\s+/i, '').replace(/\s+(for|to|from|with)$/i, '').trim();
  return stripped || item;
}

// A generic fallback task title (built from whatever text nothing else
// consumed) commonly ends with a dangling connector word once its date
// phrase is removed ("follow up with X next week" -> "follow up with"),
// same shape of leftover as stripClientName above deals with.
function trimConnectors(s: string): string {
  return s.replace(/^(for|to|from|with|and)\s+/i, '').replace(/\s+(for|to|from|with|and|the|a|an)$/i, '').trim();
}

function buildSummary(actions: Action[], clientName: string | null): string {
  if (actions.length === 0) return 'Nothing recognized';
  if (actions.length === 1) {
    const a = actions[0];
    switch (a.type) {
      case 'money': {
        const amt = a.advance ?? a.quoteValue ?? 0;
        const field = a.advance != null ? 'advance' : 'quote';
        return `${a.clientName} ${field} ₹${amt.toLocaleString('en-IN')}`;
      }
      case 'stage':
        return `${a.clientName} → ${a.stage}`;
      case 'service':
        return `${a.clientName}: ${a.service}`;
      case 'task':
        return `${a.title}${a.clientName ? ` · ${a.clientName}` : ''}`;
      case 'done':
        return `Marked "${a.match}" done`;
      case 'tick':
        return `Ticked "${a.match}"`;
      case 'client':
        return `Added ${a.name}`;
      default:
        return 'Filed 1 update';
    }
  }
  if (actions.every((a) => a.type === 'client')) {
    return `Added ${actions.length} new clients`;
  }
  return `Filed ${actions.length} updates${clientName ? ` for ${clientName}` : ''}`;
}

/**
 * Dependency-free rules engine. No network, no npm dependencies, no
 * framework imports — safe to call from a serverless route or a plain
 * script. `ctx.today` is always injected; nothing here reads the system
 * clock, so callers (and tests) fully control "now".
 */
export function parse(text: string, ctx: ParseContext): ParseResult {
  const consumed: Span[] = [];
  const claim = (span?: Span) => {
    if (span) consumed.push(span);
  };
  let bonus = 0;
  const actions: Action[] = [];

  // A batch declaration of brand-new clients ("3 clients A, B and C") is a
  // structurally different sentence from everything below — there's no
  // single owner for a stage/money/service action to attach to, just a
  // list of names to create. Handle it as its own self-contained parse
  // rather than letting resolveClient() partially match one name in the
  // list and leave the rest stranded.
  const newClients = matchNewClients(text, ctx.clients);
  if (newClients) {
    const newActions: Action[] = newClients.names.map((name) => ({ type: 'client', name, phone: null }));
    const unconsumed = redact(text, [newClients.span]);
    const wordCount = unconsumed.length ? unconsumed.split(/\s+/).length : 0;
    const penalty = Math.floor(wordCount / 5) * 0.1;
    const confidence = Math.max(0, Math.min(1, 0.9 - penalty));
    return {
      actions: newActions,
      confidence: Math.round(confidence * 100) / 100,
      engine: 'rules',
      summary: buildSummary(newActions, null),
      unconsumed
    };
  }

  // Client resolution runs first: money/stage/service/completion actions all
  // need a resolved owner, and an ambiguous match must not guess.
  const clientMatch = resolveClient(text, ctx.clients);
  if (clientMatch.kind === 'exact') {
    bonus += 0.3;
    claim(clientMatch.span);
  } else if (clientMatch.kind === 'fuzzy') {
    bonus += 0.2;
    claim(clientMatch.span);
  }
  const client = clientMatch.client;
  const clientName = client ? client.name : null;

  // Completion patterns are checked before generic stage verbs so "done" /
  // "live" / "finished" inside "logo done for X" isn't also read as the
  // bare stage verb "delivered" on the client.
  const completion = matchCompletion(text);
  if (completion) {
    claim(completion.span);
    // "X done for client" / "client's X is live" is a complete, self-
    // contained claim once the client resolves — full-strength credit,
    // not a lesser signal than the client match itself.
    bonus += 0.3;
    const item = stripClientName(completion.item, clientName);
    if (client) {
      actions.push({ type: 'done', clientName: client.name, match: item });
    } else {
      actions.push({ type: 'tick', match: item });
    }
  }

  // Money and service actions require a resolved client — the type itself
  // has no room for "unknown owner", and guessing is exactly what this
  // engine must not do. Without a client, the matched span stays
  // unconsumed, which drags confidence down and routes to escalation.
  const money = matchMoney(text, client?.stage);
  if (money) {
    // Every word that decided advance-vs-quote ("paid", "advance", ...) is
    // claimed even if no client resolved to emit the action — they're not
    // independent stage transitions, they're what the money match already
    // means, and lib/actions.ts advances stage on a money action itself.
    money.keywordSpans.forEach((s) => claim(s));
    // An explicit keyword ("paid", "advance", "quote"...) is itself a
    // confident signal — the same credit the spec gives a stage verb — even
    // though it's folded into the money action rather than a separate one.
    if (money.keywordSpans.length > 0) bonus += 0.2;
    if (client) {
      claim(money.span);
      bonus += 0.2;
      actions.push({
        type: 'money',
        clientName: client.name,
        quoteValue: money.field === 'quoteValue' ? money.amount : null,
        advance: money.field === 'advance' ? money.amount : null
      });
    }
  }

  // A completion phrase ("logo done for X", "the site is live") describes
  // finished work, not a new sale — suppress a service match that falls
  // inside it so "site is live" doesn't also attach a fresh website-build
  // checklist on top of marking the work done.
  const service = matchService(text);
  const serviceInsideCompletion = !!(service && completion && overlaps(service.span, completion.span));
  if (service && client && !serviceInsideCompletion) {
    claim(service.span);
    // Matched against the fixed 14-item catalogue (lib/catalogue.ts) —
    // effectively zero false-positive risk once matched, so it earns the
    // same full-strength credit as the client match.
    bonus += 0.3;
    actions.push({ type: 'service', clientName: client.name, service: service.service });
  }

  const date = matchDate(text, ctx.today);
  if (date) {
    claim(date.span);
    bonus += 0.2;
  }

  // A stage verb immediately followed by a *future* date describes a
  // scheduled task ("meeting Thursday" hasn't happened yet), not a stage
  // the client is already in — pair it with the closest preceding verb.
  // Every other stage verb found is a normal stage transition.
  const stageVerbExcludes: Span[] = [];
  if (completion) stageVerbExcludes.push(completion.span);
  if (money) stageVerbExcludes.push(...money.keywordSpans);
  const verbs = scanStageVerbs(text, stageVerbExcludes);
  let pairedVerbIndex = -1;
  if (date && isFutureDate(date.date, ctx.today)) {
    let bestGap = Infinity;
    verbs.forEach((v, i) => {
      const gap = date.span[0] - v.span[1];
      if (gap >= 0 && gap < bestGap) {
        bestGap = gap;
        pairedVerbIndex = i;
      }
    });
  }

  verbs.forEach((v, i) => {
    claim(v.span);
    // A recognized verb plus a resolved client is a complete claim
    // ("Verma Dental is interested") — no less certain than the client
    // match itself, so it earns the same full-strength credit. Without a
    // resolved client, keep the original lower credit: unlike service or
    // completion, verbs can stack (a sentence can mention several), and
    // full-strength credit would let two verbs on an ambiguous/unresolved
    // client reach the threshold on their own — a parse that filed nothing
    // passing as if it were confidently handled.
    bonus += client ? 0.3 : 0.2;
    if (i === pairedVerbIndex) {
      const word = text.slice(v.span[0], v.span[1]);
      actions.push({ type: 'task', title: capitalize(word), clientName, date: date!.date });
    } else if (client) {
      actions.push({ type: 'stage', clientName: client.name, stage: v.stage });
    }
  });

  const unconsumed = redact(text, consumed);
  const wordCount = unconsumed.length ? unconsumed.split(/\s+/).length : 0;
  let penalty = Math.floor(wordCount / 5) * 0.1;

  // Nothing above matched anything at all, but there's a real date to act
  // on — rather than silently discarding an ordinary task ("speak with
  // Neha about the picture today", "call the printer tomorrow"), treat the
  // rest of the sentence as the task's own title. This is a deliberately
  // wider net than the rest of the engine: unlike money or a stage, a task
  // is low-stakes and one-tap deletable, so occasionally auto-filing
  // something that turns out not to be a task (e.g. "the package arrived
  // today") is an acceptable trade for not silently dropping the far more
  // common real one — a decision made explicitly, not a default. The
  // leftover text is no longer noise once it becomes the thing the action
  // is about, so it doesn't take the usual unconsumed-word penalty below.
  if (actions.length === 0 && date) {
    const title = trimConnectors(unconsumed);
    if (title.length >= 3) {
      actions.push({ type: 'task', title: capitalize(title), clientName, date: date.date });
      bonus += 0.4;
      penalty = 0;
    }
  }

  const confidence = Math.max(0, Math.min(1, Math.min(bonus, 1) - penalty));

  return {
    actions,
    confidence: Math.round(confidence * 100) / 100,
    engine: 'rules',
    summary: buildSummary(actions, clientName),
    unconsumed
  };
}
