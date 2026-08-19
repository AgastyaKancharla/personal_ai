import { Action } from '../types';
import { ParseContext, ParseResult, Span } from './types';
import { matchMoney } from './money';
import { matchDate, isFutureDate } from './dates';
import { scanStageVerbs } from './stageVerbs';
import { resolveClient } from './clients';
import { matchService } from './services';
import { matchCompletion } from './completion';

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
      default:
        return 'Filed 1 update';
    }
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
    bonus += 0.2;
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
    bonus += 0.2;
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
    bonus += 0.2;
    if (i === pairedVerbIndex) {
      const word = text.slice(v.span[0], v.span[1]);
      actions.push({ type: 'task', title: capitalize(word), clientName, date: date!.date });
    } else if (client) {
      actions.push({ type: 'stage', clientName: client.name, stage: v.stage });
    }
  });

  const unconsumed = redact(text, consumed);
  const wordCount = unconsumed.length ? unconsumed.split(/\s+/).length : 0;
  const penalty = Math.floor(wordCount / 5) * 0.1;
  const confidence = Math.max(0, Math.min(1, Math.min(bonus, 1) - penalty));

  return {
    actions,
    confidence: Math.round(confidence * 100) / 100,
    engine: 'rules',
    summary: buildSummary(actions, clientName),
    unconsumed
  };
}
