import { describe, expect, it } from 'vitest';
import { matchDate, isFutureDate } from './dates';
import { addDays, iso, mondayOf, parseIso } from '../dates';

// Pinned "today" — 2026-08-19 is a Wednesday, i.e. genuinely mid-week.
const TODAY = '2026-08-19';
const today = parseIso(TODAY);
// Sanity check the fixture itself is what it claims to be.
if ((today.getDay() + 6) % 7 !== 2) throw new Error('TODAY fixture must be a Wednesday');

describe('matchDate', () => {
  it('today', () => {
    expect(matchDate('call today', TODAY)!.date).toBe(TODAY);
  });

  it('tomorrow', () => {
    expect(matchDate('call tomorrow', TODAY)!.date).toBe(iso(addDays(today, 1)));
  });

  it('day after tomorrow', () => {
    expect(matchDate('call day after tomorrow', TODAY)!.date).toBe(iso(addDays(today, 2)));
  });

  it('next week resolves to the coming Monday', () => {
    const result = matchDate('follow up next week', TODAY);
    const nextMonday = iso(addDays(mondayOf(today), 7));
    expect(result!.date).toBe(nextMonday);
    expect(((parseIso(result!.date).getDay() + 6) % 7)).toBe(0); // is a Monday
  });

  it('a weekday name resolves forward, never to today or the past', () => {
    // today is Wednesday; "Wednesday" itself must resolve to next week, not today
    const sameDay = matchDate('meeting Wednesday', TODAY);
    expect(sameDay!.date).toBe(iso(addDays(today, 7)));

    // Thursday is one day out
    const thursday = matchDate('meeting Thursday', TODAY);
    expect(thursday!.date).toBe(iso(addDays(today, 1)));

    // Monday (already passed this week) must roll to next Monday, not last Monday
    const monday = matchDate('meeting Monday', TODAY);
    expect(monday!.date).toBe(iso(addDays(today, 5)));
  });

  it('three-letter weekday abbreviations resolve the same way as full names', () => {
    expect(matchDate('meeting thu', TODAY)!.date).toBe(iso(addDays(today, 1)));
  });

  it('Nth-of-month resolves within this month when the day has not passed', () => {
    // today is the 19th; the 25th hasn't happened yet
    expect(matchDate('meeting on the 25th', TODAY)!.date).toBe('2026-08-25');
    expect(matchDate('meeting on 25', TODAY)!.date).toBe('2026-08-25');
  });

  it('Nth-of-month rolls to next month once the day has passed', () => {
    // the 5th already happened this month
    expect(matchDate('meeting on the 5th', TODAY)!.date).toBe('2026-09-05');
  });

  it('DD/MM and DD-MM parse as day/month, never month/day', () => {
    expect(matchDate('deliver on 25/12', TODAY)!.date).toBe('2026-12-25');
    expect(matchDate('deliver on 03-01', TODAY)!.date).toBe('2027-01-03'); // already past this year -> rolls forward
  });

  it('returns null when no date phrase is present', () => {
    expect(matchDate('called Bright Smile, interested', TODAY)).toBeNull();
  });
});

describe('isFutureDate', () => {
  it('is true for a date after today and false for today or earlier', () => {
    expect(isFutureDate(iso(addDays(today, 1)), TODAY)).toBe(true);
    expect(isFutureDate(TODAY, TODAY)).toBe(false);
    expect(isFutureDate(iso(addDays(today, -1)), TODAY)).toBe(false);
  });
});
