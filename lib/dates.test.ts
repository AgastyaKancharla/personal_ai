import { describe, expect, it } from 'vitest';
import { monthRange, nextRecurrenceDate, todayRange, weekRange } from './dates';

// Fixed base so every case is deterministic — a Wednesday, matching the
// convention used across lib/parse's own test fixtures.
const BASE = new Date(2026, 7, 19); // 19 Aug 2026, Wednesday

describe('date range helpers', () => {
  it('todayRange collapses to a single-day range', () => {
    expect(todayRange(BASE)).toEqual({ startIso: '2026-08-19', endIso: '2026-08-19' });
  });

  it('weekRange(0) returns the current Monday-to-Sunday range', () => {
    expect(weekRange(0, BASE)).toEqual({ startIso: '2026-08-17', endIso: '2026-08-23' });
  });

  it('weekRange(1) returns next week', () => {
    expect(weekRange(1, BASE)).toEqual({ startIso: '2026-08-24', endIso: '2026-08-30' });
  });

  it('weekRange(-1) returns last week', () => {
    expect(weekRange(-1, BASE)).toEqual({ startIso: '2026-08-10', endIso: '2026-08-16' });
  });

  it('monthRange(0) returns the full current calendar month', () => {
    expect(monthRange(0, BASE)).toEqual({ startIso: '2026-08-01', endIso: '2026-08-31' });
  });

  it('monthRange(1) crosses a year boundary correctly from December', () => {
    const dec = new Date(2026, 11, 15);
    expect(monthRange(1, dec)).toEqual({ startIso: '2027-01-01', endIso: '2027-01-31' });
  });

  it('monthRange handles a 28-day February correctly', () => {
    const jan = new Date(2027, 0, 15); // 2027 is not a leap year
    expect(monthRange(0, jan)).toEqual({ startIso: '2027-01-01', endIso: '2027-01-31' });
    expect(monthRange(1, jan)).toEqual({ startIso: '2027-02-01', endIso: '2027-02-28' });
  });

  it('monthRange handles a 29-day February in a leap year', () => {
    const jan = new Date(2028, 0, 15); // 2028 is a leap year
    expect(monthRange(1, jan)).toEqual({ startIso: '2028-02-01', endIso: '2028-02-29' });
  });
});

describe('nextRecurrenceDate', () => {
  it('daily advances by one day', () => {
    expect(nextRecurrenceDate('2026-08-19', 'daily')).toBe('2026-08-20');
  });

  it('weekly advances by seven days', () => {
    expect(nextRecurrenceDate('2026-08-19', 'weekly')).toBe('2026-08-26');
  });

  it('monthly advances to the same day next month', () => {
    expect(nextRecurrenceDate('2026-08-19', 'monthly')).toBe('2026-09-19');
  });

  it('monthly clamps into a shorter target month instead of rolling over', () => {
    expect(nextRecurrenceDate('2026-01-31', 'monthly')).toBe('2026-02-28');
  });

  it('monthly crosses a year boundary from December', () => {
    expect(nextRecurrenceDate('2026-12-15', 'monthly')).toBe('2027-01-15');
  });
});
