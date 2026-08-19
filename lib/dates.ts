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
