import { inr } from '../dates';

export interface QuoteDocItem {
  text: string;
  price?: string;
  deadline?: string;
  category?: string;
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
// totals, contact details, section headers, signature blocks. The
// AgastyaOne-specific headings are included here too as a second layer of
// defense in case the template-aware path below over/under-shoots.
const SKIP_LINE =
  /^(page \d+( of \d+)?|total|subtotal|grand total|gst|tax\b|amount\b|terms( and conditions)?|signature|prepared by|contact|to:|from:|date:|www\.|https?:|investment summary|beyond this quote|what happens next|what we're fixing|payment terms|terms & validity|acceptance|valid until|prepared for)/i;
const CONTACT_LINE = /^[\w.+-]+@[\w-]+\.[a-z]{2,}$|^\+?\d[\d\s-]{7,}$/i;

// A full prose sentence (long, ends with a period) reads as terms
// boilerplate, not a scope-of-work bullet — quote line items are short
// phrases. Loose on purpose: worst case a real item gets filtered and the
// founder re-adds it via "Add one", never a bad one silently kept.
function looksLikeProse(line: string): boolean {
  return line.split(/\s+/).length > 14 && /[.!?]$/.test(line);
}

const MAX_ITEMS = 60;

// --- AgastyaOne quote template — anchor-based extraction -------------------
//
// generate_quote.js (the agastyaone-quote skill) always emits a service's
// scope as a service-name line, then a two-column table whose cells are
// titled literally "Setup Includes" and "Every Month" with bullet items
// under each — confirmed against a real generated document, not guessed.
// There is no per-item price or deadline anywhere in this template: price
// only exists at service level in "Investment Summary" (a table with one
// row per service — present whether there's 1 service or many — plus
// price cards when there's exactly 1, which duplicate the same numbers).
// Anchoring on the literal "Setup Includes"/"Every Month" markers sidesteps
// the whole "is this short line a heading or a real item" problem that a
// per-line blacklist can never fully solve.

const SCOPE_MARKERS = ['setup includes', 'every month'];
const STOP_HEADINGS = [
  'investment summary',
  "what we're fixing",
  'beyond this quote',
  'what happens next',
  'payment terms',
  'terms & validity',
  'acceptance'
];

function isBoundary(lower: string): boolean {
  return SCOPE_MARKERS.includes(lower) || STOP_HEADINGS.some((h) => lower.startsWith(h));
}

interface TemplateItem {
  text: string;
  category?: string;
}

function extractAgastyaOneScope(rawLines: string[]): TemplateItem[] | null {
  const lower = rawLines.map((l) => l.toLowerCase());
  if (!lower.some((l) => SCOPE_MARKERS.includes(l))) return null;

  // A scope-bullet run also ends the moment the *next* line is itself a
  // "Setup Includes" marker (a new service always starts there, never with
  // "Every Month") — that current line is really the next service's
  // subheading, not a bullet, and must be left for the outer loop to
  // consume so it can be captured as that next service's category. "Every
  // Month" is excluded from this check: it's the second column of the
  // *same* service's row, so the line right before it is still a real bullet.
  const runContinues = (idx: number) => !isBoundary(lower[idx]) && !(idx + 1 < rawLines.length && lower[idx + 1] === 'setup includes');

  const items: TemplateItem[] = [];
  let currentCategory: string | undefined;
  let i = 0;
  while (i < rawLines.length) {
    if (lower[i] === 'setup includes') {
      // The service-name subheading always immediately precedes "Setup
      // Includes" in this template — confirmed against real output.
      const prev = rawLines[i - 1];
      if (prev && !isBoundary(lower[i - 1])) currentCategory = prev;
      i++;
      while (i < rawLines.length && runContinues(i)) {
        items.push({ text: rawLines[i], category: currentCategory });
        i++;
      }
    } else if (lower[i] === 'every month') {
      // "Every Month" is the second column of the same row — reuse
      // whichever service's "Setup Includes" we just saw, not whatever
      // line happens to precede it (that's the last Setup Includes bullet).
      i++;
      while (i < rawLines.length && runContinues(i)) {
        items.push({ text: rawLines[i], category: currentCategory });
        i++;
      }
    } else {
      i++;
    }
  }
  return items;
}

// Investment Summary always lists one row per service — "Service name"
// followed within a line or two by its one-time price — whether there's a
// single service (where price cards also appear, duplicating the same
// number) or several. Match each category name found by the scope
// extraction above against that table, rather than trying to distinguish
// the two layouts.
function resolveServicePrices(rawLines: string[], lower: string[], categories: string[]): Map<string, string> {
  const prices = new Map<string, string>();
  const startIdx = lower.findIndex((l) => l.startsWith('investment summary'));
  if (startIdx === -1) return prices;
  let endIdx = rawLines.length;
  for (let i = startIdx + 1; i < rawLines.length; i++) {
    if (STOP_HEADINGS.some((h) => h !== 'investment summary' && lower[i].startsWith(h))) {
      endIdx = i;
      break;
    }
  }

  for (const category of categories) {
    const catLower = category.toLowerCase();
    for (let i = startIdx + 1; i < endIdx; i++) {
      if (lower[i] !== catLower) continue;
      for (let j = i + 1; j < Math.min(i + 4, endIdx); j++) {
        const found = findPrice(rawLines[j]);
        if (found) {
          prices.set(category, found.price);
          break;
        }
      }
      break;
    }
  }
  return prices;
}

/** Best-effort, dependency-free line-item extraction from a quote
 * document's raw text — no LLM, no network call. Never authoritative on
 * its own: every result is meant for a review screen the founder edits
 * before anything is added to a client's checklist, the same "never
 * guess, log for correction" posture as the quick-add rules engine. */
export function parseQuoteDoc(rawText: string): QuoteDocResult {
  const allLines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const allLower = allLines.map((l) => l.toLowerCase());

  const templateItems = extractAgastyaOneScope(allLines);
  if (templateItems && templateItems.length) {
    const categories = Array.from(new Set(templateItems.map((it) => it.category).filter((c): c is string => !!c)));
    const prices = resolveServicePrices(allLines, allLower, categories);
    const items: QuoteDocItem[] = templateItems.slice(0, MAX_ITEMS).map((it) => ({
      text: it.text,
      category: it.category,
      price: it.category ? prices.get(it.category) : undefined
    }));
    return { items, totalLines: templateItems.length };
  }

  // Fallback: generic per-line heuristic for documents that aren't this
  // known template (a client-edited quote, a different format entirely).
  const lines = allLines
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
