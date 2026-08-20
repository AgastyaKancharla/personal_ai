import { describe, expect, it } from 'vitest';
import { parse } from './index';
import { CLIENTS, HUNDRED_ENTRIES, TODAY, Fixture } from './fixtures/hundredEntries';
import { Action } from '../types';

function matches(actions: Action[], expected: Fixture['expected']): boolean {
  if (actions.length !== expected.length) return false;
  return expected.every((exp, i) => {
    const a = actions[i] as unknown as Record<string, unknown>;
    if (a.type !== exp.type) return false;
    return Object.keys(exp).every((k) => k === 'type' || a[k] === exp[k]);
  });
}

describe('rules engine — 100 hand-written entries', () => {
  it('has exactly 100 fixtures', () => {
    expect(HUNDRED_ENTRIES.length).toBe(100);
  });

  it('handles at least 70% of the 100 entries exactly, with no network call', () => {
    const failures: string[] = [];
    let passed = 0;
    for (const fixture of HUNDRED_ENTRIES) {
      const result = parse(fixture.input, { clients: CLIENTS, today: TODAY });
      if (matches(result.actions, fixture.expected)) {
        passed++;
      } else {
        failures.push(`"${fixture.input}"\n  expected: ${JSON.stringify(fixture.expected)}\n  actual:   ${JSON.stringify(result.actions)}`);
      }
    }
    const rate = passed / HUNDRED_ENTRIES.length;
    if (rate < 0.7) {
      console.log(`\n${failures.length} failures:\n` + failures.join('\n'));
    }
    expect(rate).toBeGreaterThanOrEqual(0.7);
  });
});
