import { StageKey } from '../types';
import { stageIndex } from '../catalogue';
import { Span } from './types';

export interface MoneyMatch {
  amount: number;
  field: 'advance' | 'quoteValue';
  span: Span;
  /** Every occurrence of a field-deciding keyword ("paid", "advance",
   * "quote"...) — e.g. both "paid" and "advance" in "paid 25k advance".
   * Excluded from stage-verb scanning so those same words aren't also
   * read as an independent stage transition to the same stage. */
  keywordSpans: Span[];
}

// Longest/most-specific suffix first so "1.5L" isn't mistaken for a bare
// number and "2cr" isn't mistaken for a lakh.
const CRORE_RE = /(\d+(?:\.\d+)?)\s*(cr|crore)\b/i;
const LAKH_RE = /(\d+(?:\.\d+)?)\s*(lakh|lac)\b/i;
const L_SUFFIX_RE = /(\d+(?:\.\d+)?)\s*[lL]\b/;
const K_RE = /(\d+(?:\.\d+)?)\s*[kK]\b/;
const RUPEE_RE = /₹\s?([\d,]+(?:\.\d+)?)/;
// Comma-grouped ("80,000") or a bare 4-7 digit number with no unit suffix.
const BARE_NUM_RE = /\b(\d{1,3}(?:,\d{2,3})+|\d{4,7})\b/;

const CANDIDATES: { re: RegExp; mult: number }[] = [
  { re: CRORE_RE, mult: 10000000 },
  { re: LAKH_RE, mult: 100000 },
  { re: L_SUFFIX_RE, mult: 100000 },
  { re: K_RE, mult: 1000 },
  { re: RUPEE_RE, mult: 1 },
  { re: BARE_NUM_RE, mult: 1 }
];

const ADVANCE_WORDS = ['payment received', 'advance', 'paid', 'received', 'token'];
const QUOTE_WORDS = ['quote', 'quoted', 'estimate', 'proposal'];

function findAmount(text: string): { amount: number; span: Span } | null {
  // Try every unit pattern and keep the leftmost match in the text — a
  // sentence can mention more than one amount ("quoted 1.5L, paid 20k
  // advance"), and the earliest-occurring one should never lose to a
  // later one just because its unit pattern happens to be checked first.
  let best: { amount: number; span: Span } | null = null;
  for (const { re, mult } of CANDIDATES) {
    const m = re.exec(text);
    if (!m) continue;
    const amount = parseFloat(m[1].replace(/,/g, '')) * mult;
    if (!isFinite(amount) || amount <= 0) continue;
    if (!best || m.index < best.span[0]) {
      best = { amount, span: [m.index, m.index + m[0].length] };
    }
  }
  return best;
}

function allSpans(lower: string, words: string[]): Span[] {
  const spans: Span[] = [];
  for (const w of words) {
    let idx = lower.indexOf(w);
    while (idx !== -1) {
      spans.push([idx, idx + w.length]);
      idx = lower.indexOf(w, idx + 1);
    }
  }
  return spans;
}

function nearestDistance(spans: Span[], from: number): number {
  let best = Infinity;
  for (const [s] of spans) best = Math.min(best, Math.abs(s - from));
  return best;
}

function detectField(
  text: string,
  moneySpan: Span,
  clientStage: StageKey | undefined
): { field: 'advance' | 'quoteValue'; keywordSpans: Span[] } {
  const lower = text.toLowerCase();
  const advanceSpans = allSpans(lower, ADVANCE_WORDS);
  const quoteSpans = allSpans(lower, QUOTE_WORDS);
  const dAdvance = nearestDistance(advanceSpans, moneySpan[0]);
  const dQuote = nearestDistance(quoteSpans, moneySpan[0]);
  if (dAdvance === Infinity && dQuote === Infinity) {
    const field = clientStage && stageIndex(clientStage) >= stageIndex('quoted') ? 'advance' : 'quoteValue';
    return { field, keywordSpans: [] };
  }
  return dAdvance <= dQuote ? { field: 'advance', keywordSpans: advanceSpans } : { field: 'quoteValue', keywordSpans: quoteSpans };
}

/** Finds the first money mention in `text`. Strips commas before parsing. */
export function matchMoney(text: string, clientStage: StageKey | undefined): MoneyMatch | null {
  const found = findAmount(text);
  if (!found) return null;
  const { field, keywordSpans } = detectField(text, found.span, clientStage);
  return { amount: found.amount, field, span: found.span, keywordSpans };
}
