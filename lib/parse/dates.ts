import { addDays, iso, mondayOf, parseIso } from '../dates';
import { Span } from './types';

export interface DateMatch {
  date: string; // YYYY-MM-DD
  span: Span;
}

const WEEKDAYS: { full: string; abbrev: string; idx: number }[] = [
  { full: 'monday', abbrev: 'mon', idx: 0 },
  { full: 'tuesday', abbrev: 'tue', idx: 1 },
  { full: 'wednesday', abbrev: 'wed', idx: 2 },
  { full: 'thursday', abbrev: 'thu', idx: 3 },
  { full: 'friday', abbrev: 'fri', idx: 4 },
  { full: 'saturday', abbrev: 'sat', idx: 5 },
  { full: 'sunday', abbrev: 'sun', idx: 6 }
];
const WEEKDAY_RE = new RegExp(
  `\\b(${WEEKDAYS.map((w) => w.full).join('|')}|${WEEKDAYS.map((w) => w.abbrev).join('|')})\\b`,
  'i'
);

const DAY_AFTER_TOMORROW_RE = /\bday after tomorrow\b/i;
const TOMORROW_RE = /\btomorrow\b/i;
const TODAY_RE = /\btoday\b/i;
const NEXT_WEEK_RE = /\bnext week\b/i;
const DD_MM_RE = /\b(\d{1,2})[\/\-](\d{1,2})\b/;
const ORDINAL_DAY_RE = /\b(\d{1,2})(st|nd|rd|th)\b/i;
const ON_DAY_RE = /\bon\s+(\d{1,2})\b/i;

function sameCalendarDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Finds the first (highest-priority) date phrase in `text`, relative to `todayIso`. */
export function matchDate(text: string, todayIso: string): DateMatch | null {
  const today = parseIso(todayIso);

  let m = DAY_AFTER_TOMORROW_RE.exec(text);
  if (m) return { date: iso(addDays(today, 2)), span: [m.index, m.index + m[0].length] };

  m = TOMORROW_RE.exec(text);
  if (m) return { date: iso(addDays(today, 1)), span: [m.index, m.index + m[0].length] };

  m = TODAY_RE.exec(text);
  if (m) return { date: todayIso, span: [m.index, m.index + m[0].length] };

  m = NEXT_WEEK_RE.exec(text);
  if (m) return { date: iso(addDays(mondayOf(today), 7)), span: [m.index, m.index + m[0].length] };

  m = DD_MM_RE.exec(text);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      let candidate = new Date(today.getFullYear(), month - 1, day);
      if (candidate.getTime() < today.getTime() && !sameCalendarDate(candidate, today)) {
        candidate = new Date(today.getFullYear() + 1, month - 1, day);
      }
      return { date: iso(candidate), span: [m.index, m.index + m[0].length] };
    }
  }

  m = WEEKDAY_RE.exec(text);
  if (m) {
    const found = WEEKDAYS.find((w) => w.full === m![1].toLowerCase() || w.abbrev === m![1].toLowerCase());
    if (found) {
      const todayIdx = (today.getDay() + 6) % 7;
      let diff = (found.idx - todayIdx + 7) % 7;
      if (diff === 0) diff = 7; // resolve forward only — never today, never yesterday
      return { date: iso(addDays(today, diff)), span: [m.index, m.index + m[0].length] };
    }
  }

  m = ORDINAL_DAY_RE.exec(text);
  if (!m) m = ON_DAY_RE.exec(text);
  if (m) {
    const day = parseInt(m[1], 10);
    if (day >= 1 && day <= 31) {
      let candidate = new Date(today.getFullYear(), today.getMonth(), day);
      if (day < today.getDate()) {
        candidate = new Date(today.getFullYear(), today.getMonth() + 1, day);
      }
      return { date: iso(candidate), span: [m.index, m.index + m[0].length] };
    }
  }

  return null;
}

export function isFutureDate(dateIso: string, todayIso: string): boolean {
  return parseIso(dateIso).getTime() > parseIso(todayIso).getTime();
}
