import { describe, expect, it } from 'vitest';
import { matchMoney } from './money';

describe('matchMoney', () => {
  const cases: [string, number, 'advance' | 'quoteValue'][] = [
    ['paid 25k advance', 25000, 'advance'],
    ['1.5L quote', 150000, 'quoteValue'],
    ['₹80,000 advance received', 80000, 'advance'],
    ['1.5 lakh advance', 150000, 'advance'],
    ['1.5 lac advance', 150000, 'advance'],
    ['2cr quote for the full project', 20000000, 'quoteValue'],
    ['2 crore proposal', 20000000, 'quoteValue'],
    ['quoted 80000 for the website', 80000, 'quoteValue'],
    ['80000', 80000, 'quoteValue'], // no keyword, no client stage -> defaults to quoteValue
    ['token amount 5k received', 5000, 'advance']
  ];

  it.each(cases)('%s -> %d (%s)', (text, amount, field) => {
    const m = matchMoney(text, undefined);
    expect(m).not.toBeNull();
    expect(m!.amount).toBe(amount);
    expect(m!.field).toBe(field);
  });

  it('strips commas before parsing', () => {
    const m = matchMoney('quote is ₹1,25,000', undefined);
    expect(m!.amount).toBe(125000);
  });

  it('defaults to advance when client is already past quoted stage and no keyword present', () => {
    const m = matchMoney('25k for Bright Smile', 'advance');
    expect(m!.field).toBe('advance');
  });

  it('defaults to quoteValue when client is still early-stage and no keyword present', () => {
    const m = matchMoney('25k for Bright Smile', 'interested');
    expect(m!.field).toBe('quoteValue');
  });

  it('returns null when there is no amount', () => {
    expect(matchMoney('called Bright Smile, interested', undefined)).toBeNull();
  });
});
