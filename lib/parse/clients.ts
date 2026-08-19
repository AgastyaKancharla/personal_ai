import { Client } from '../types';
import { Span } from './types';

export interface ClientMatch {
  client: Client | null;
  kind: 'exact' | 'fuzzy' | 'ambiguous' | 'none';
  span?: Span;
}

const tokenize = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

interface TextToken {
  word: string;
  span: Span;
}

function tokenizeWithSpans(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  const re = /[a-z0-9]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    tokens.push({ word: m[0].toLowerCase(), span: [m.index, m.index + m[0].length] });
  }
  return tokens;
}

/** Longest contiguous run of `nameWords` found (in order) within `textTokens`. */
function longestCommonRun(textTokens: TextToken[], nameWords: string[]): { len: number; span: Span } | null {
  let best: { len: number; span: Span } | null = null;
  for (let i = 0; i < textTokens.length; i++) {
    let len = 0;
    while (
      i + len < textTokens.length &&
      len < nameWords.length &&
      textTokens[i + len].word === nameWords[len]
    ) {
      len++;
    }
    if (len > 0 && (!best || len > best.len)) {
      best = { len, span: [textTokens[i].span[0], textTokens[i + len - 1].span[1]] };
    }
  }
  return best;
}

/**
 * Exact match first (case-insensitive full-name substring), then fuzzy
 * (longest contiguous word-run overlap, e.g. "bright smile" inside "Bright
 * Smile Dental Clinic"). Two or more equally-good candidates is a failure,
 * not a guess — filing a payment against the wrong clinic is worse than
 * asking, so ambiguous returns no client and lets confidence fall.
 */
export function resolveClient(text: string, clients: Client[]): ClientMatch {
  if (clients.length === 0) return { client: null, kind: 'none' };
  const lower = text.toLowerCase();

  const exactHits = clients
    .map((c) => ({ c, idx: lower.indexOf(c.name.toLowerCase()) }))
    .filter((h) => h.idx !== -1);

  if (exactHits.length > 0) {
    const maxLen = Math.max(...exactHits.map((h) => h.c.name.length));
    const longest = exactHits.filter((h) => h.c.name.length === maxLen);
    if (longest.length === 1) {
      const { c, idx } = longest[0];
      return { client: c, kind: 'exact', span: [idx, idx + c.name.length] };
    }
    return { client: null, kind: 'ambiguous' };
  }

  const textTokens = tokenizeWithSpans(text);
  let bestRun = 0;
  let candidates: { c: Client; span: Span }[] = [];
  for (const c of clients) {
    const nameWords = tokenize(c.name);
    const run = longestCommonRun(textTokens, nameWords);
    if (!run) continue;
    if (run.len === 1) {
      const word = text.slice(run.span[0], run.span[1]).toLowerCase();
      if (word.length < 5) continue; // a single short/generic word isn't enough to identify a client
    }
    if (run.len > bestRun) {
      bestRun = run.len;
      candidates = [{ c, span: run.span }];
    } else if (run.len === bestRun) {
      candidates.push({ c, span: run.span });
    }
  }

  if (candidates.length === 1) {
    return { client: candidates[0].c, kind: 'fuzzy', span: candidates[0].span };
  }
  if (candidates.length > 1) {
    return { client: null, kind: 'ambiguous' };
  }
  return { client: null, kind: 'none' };
}
