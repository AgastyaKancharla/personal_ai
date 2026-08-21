import { Client } from './types';

export interface RevenueSummary {
  totalQuoted: number;
  totalCollected: number;
  totalOutstanding: number;
}

/**
 * Pure rollup across every client's quoteValue/advance — same balance
 * formula ClientSheet already uses per client (Math.max(0, quote -
 * advance)), just summed. No date range: this is a running total across
 * the whole pipeline, not a period report.
 */
export function summarizeRevenue(clients: Client[]): RevenueSummary {
  return clients.reduce<RevenueSummary>(
    (acc, c) => {
      const quoted = Number(c.quoteValue) || 0;
      const collected = Number(c.advance) || 0;
      acc.totalQuoted += quoted;
      acc.totalCollected += collected;
      acc.totalOutstanding += Math.max(0, quoted - collected);
      return acc;
    },
    { totalQuoted: 0, totalCollected: 0, totalOutstanding: 0 }
  );
}
