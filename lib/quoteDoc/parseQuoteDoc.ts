import { inr } from '../dates';

export interface QuoteDocItem {
  text: string;
  price?: string;
  deadline?: string;
}

export interface QuoteDocResult {
  items: QuoteDocItem[];
  totalLines: number;
}

// Money detection, adapted from lib/parse/money.ts's amount patterns —
// applied per line rather than per sentence, with no advance-vs-quote
// field attribution to work out (a quote doc's numbers are prices, not a
// running conversation about what's been paid).
const CRORE_RE = /(\d+(?:\.\d+)?)\s*(cr|crore)\b/i;
const LAKH_RE = /(\d+(?:\.\d+)?)\s*(lakh|lac)\b/i;
const L_SUFFIX_RE = /(\d+(?:\.\d+)?)\s*[lL]\b/;
const K_RE = /(\d+(?:\.\d+)?)\s*[kK]\b/;
const RUPEE_RE = /₹\s?([\d,]+(?:\.\d+)?)/;
const RS_RE = /\b(?:rs\.?|inr)\s?([\d,]+(?:\.\d+)?)/i;
const BARE_NUM_RE = /\b(\d{1,3}(?:,\d{2,3})+|\d{4,7})\b/;

const MONEY_CANDIDATES: { re: RegExp; mult: number }[] = [
  { re: CRORE_RE, mult: 10000000 },
  { re: LAKH_RE, mult: 100000 },
  { re: L_SUFFIX_RE, mult: 100000 },
  { re: K_RE, mult: 1000 },
  { re: RUPEE_RE, mult: 1 },
  { re: RS_RE, mult: 1 },
  { re: BARE_NUM_RE, mult: 1 }
];

function findPrice(line: string): { price: string; span: [number, number] } | null {
  let best: { amount: number; span: [number, number] } | null = null;
  for (const { re, mult } of MONEY_CANDIDATES) {
    const m = re.exec(line);
    if (!m) continue;
    const amount = parseFloat(m[1].replace(/,/g, '')) * mult;
    if (!isFinite(amount) || amount <= 0) continue;
    if (!best || m.index < best.span[0]) best = { amount, span: [m.index, m.index + m[0].length] };
  }
  return best ? { price: inr(best.amount), span: best.span } : null;
}

// Deadline detection stays deliberately loose (explicit dates, relative
// windows like "within 2 weeks", or a bare month/day mention) — this only
// ever pre-fills a field the founder reviews and can edit before anything
// reaches the checklist, so a false positive costs one edit, not a bad save.
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december';
const DATE_PATTERNS: RegExp[] = [
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
  new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS})[a-z]*\\b`, 'i'),
  new RegExp(`\\b(?:${MONTHS})[a-z]*\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, 'i'),
  /\bwithin\s+\d+\s*(?:days?|weeks?|months?)\b/i,
  /\b\d+\s*(?:days?|weeks?|months?)\s+(?:from|after)\b/i
];

function findDeadline(line: string): string | null {
  for (const re of DATE_PATTERNS) {
    const m = re.exec(line);
    if (m) return m[0].trim();
  }
  return null;
}

// Lines that are structurally never a deliverable — page furniture,
// totals, contact details, section headers, signature blocks.
const SKIP_LINE =
  /^(page \d+( of \d+)?|total|subtotal|grand total|gst|tax\b|amount\b|terms( and conditions)?|signature|prepared by|contact|to:|from:|date:|www\.|https?:)/i;
const CONTACT_LINE = /^[\w.+-]+@[\w-]+\.[a-z]{2,}$|^\+?\d[\d\s-]{7,}$/i;

// A full prose sentence (long, ends with a period) reads as terms
// boilerplate, not a scope-of-work bullet — quote line items are short
// phrases. Loose on purpose: worst case a real item gets filtered and the
// founder re-adds it via "Add one", never a bad one silently kept.
function looksLikeProse(line: string): boolean {
  return line.split(/\s+/).length > 14 && /[.!?]$/.test(line);
}

const MAX_ITEMS = 60;

/** Best-effort, dependency-free line-item extraction from a quote
 * document's raw text — no LLM, no network call. Never authoritative on
 * its own: every result is meant for a review screen the founder edits
 * before anything is added to a client's checklist, the same "never
 * guess, log for correction" posture as the quick-add rules engine. */
export function parseQuoteDoc(rawText: string): QuoteDocResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•\-–*]*\d*[.)]?\s*/, '').trim())
    .filter((l) => l.length >= 3 && l.length <= 200)
    .filter((l) => !SKIP_LINE.test(l) && !CONTACT_LINE.test(l) && !looksLikeProse(l));

  const items: QuoteDocItem[] = [];
  for (const line of lines) {
    if (items.length >= MAX_ITEMS) break;
    const priceMatch = findPrice(line);
    const deadline = findDeadline(line) ?? undefined;
    let text = line;
    if (priceMatch) {
      text = (line.slice(0, priceMatch.span[0]) + line.slice(priceMatch.span[1]))
        .replace(/[-:•,]+$/, '')
        .replace(/^[-:•,]+/, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    if (!text || text.length < 3) text = line;
    items.push({ text, price: priceMatch?.price, deadline });
  }

  return { items, totalLines: lines.length };
}
