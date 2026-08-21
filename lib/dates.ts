import { RecurrenceFreq } from './types';

export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const pad = (n: number) => String(n).padStart(2, '0');

export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const parseIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const mondayOf = (d: Date) => {
  const x = new Date(d);
  const g = (x.getDay() + 6) % 7;
  return addDays(x, -g);
};
export const inr = (n: number | string) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
export const uid = () => Math.random().toString(36).slice(2, 10);
export const dowOf = (d: Date) => DOW[(d.getDay() + 6) % 7];

export interface DateRange {
  startIso: string;
  endIso: string;
}

// `base` defaults to the real "now" for convenience at call sites, but is
// always an explicit parameter — nothing in here reads the system clock
// implicitly, same convention as lib/parse/dates.ts's todayIso injection,
// so a caller (or a test) can pin "today" precisely.
export const todayRange = (base: Date = new Date()): DateRange => {
  const t = iso(base);
  return { startIso: t, endIso: t };
};

export const weekRange = (offsetWeeks = 0, base: Date = new Date()): DateRange => {
  const start = mondayOf(addDays(base, offsetWeeks * 7));
  return { startIso: iso(start), endIso: iso(addDays(start, 6)) };
};

export const monthRange = (offsetMonths = 0, base: Date = new Date()): DateRange => {
  const first = new Date(base.getFullYear(), base.getMonth() + offsetMonths, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return { startIso: iso(first), endIso: iso(last) };
};

// A day's tasks in the order the day actually runs in: timed tasks lead,
// chronologically, then untimed tasks follow ranked by the `important`
// flag — the same ordering TodayView and WeekView both want for a day's
// list, factored out once rather than duplicated per component.
export const byTimeline = (a: { time?: string; important?: boolean }, b: { time?: string; important?: boolean }): number => {
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time !== undefined && b.time === undefined) return -1;
  if (a.time === undefined && b.time !== undefined) return 1;
  return Number(b.important) - Number(a.important);
};

// "14:30" -> "2:30 PM". Formats a stored 24-hour HH:MM for display —
// deliberately not locale-aware (this app is already fixed to Indian
// conventions elsewhere), just 12-hour with AM/PM, the everyday reading.
export const formatTime = (time: string): string => {
  const [h, m] = time.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${period}`;
};

// Advances a recurring task's date by one period. Monthly clamps into the
// target month (31 Jan -> 28/29 Feb, not a Date-rollover into March) so a
// month-end task doesn't drift to a different day of the month over time.
export const nextRecurrenceDate = (dateIso: string, freq: RecurrenceFreq): string => {
  const d = parseIso(dateIso);
  if (freq === 'daily') return iso(addDays(d, 1));
  if (freq === 'weekly') return iso(addDays(d, 7));
  const targetMonth = d.getMonth() + 1;
  const lastDayOfTargetMonth = new Date(d.getFullYear(), targetMonth + 1, 0).getDate();
  return iso(new Date(d.getFullYear(), targetMonth, Math.min(d.getDate(), lastDayOfTargetMonth)));
};
