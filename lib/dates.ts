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
