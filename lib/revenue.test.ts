import { describe, expect, it } from 'vitest';
import { summarizeRevenue } from './revenue';
import { mkClient } from './parse/testHelpers';

describe('summarizeRevenue', () => {
  it('returns all zeros for no clients', () => {
    expect(summarizeRevenue([])).toEqual({ totalQuoted: 0, totalCollected: 0, totalOutstanding: 0 });
  });

  it('sums quoteValue and advance across clients, and derives outstanding as their difference', () => {
    const a = mkClient('A');
    a.quoteValue = '50000';
    a.advance = '20000';
    const b = mkClient('B');
    b.quoteValue = '30000';
    b.advance = '30000';
    const summary = summarizeRevenue([a, b]);
    expect(summary.totalQuoted).toBe(80000);
    expect(summary.totalCollected).toBe(50000);
    expect(summary.totalOutstanding).toBe(30000);
  });

  it('clamps a client with no matching quote (advance would exceed quote) at zero, not negative', () => {
    const a = mkClient('A');
    a.quoteValue = '10000';
    a.advance = '15000';
    const summary = summarizeRevenue([a]);
    expect(summary.totalOutstanding).toBe(0);
  });

  it('treats an unset quoteValue/advance as zero, not NaN', () => {
    const a = mkClient('A');
    const summary = summarizeRevenue([a]);
    expect(summary).toEqual({ totalQuoted: 0, totalCollected: 0, totalOutstanding: 0 });
  });
});
