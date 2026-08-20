import { describe, expect, it } from 'vitest';
import { parse } from './index';
import { mkClient } from './testHelpers';

// Locks in the confidence recalibration: a fully correct single-signal parse
// (client + one verb/service/completion) must clear the 0.6 escalation
// threshold, while an incomplete parse (no client, or an ambiguous one that
// resolved to nothing) must never cross it — a future weight change that
// lets either invariant slip should fail here, not surface as a silent
// production regression.
const TODAY = '2026-08-19';

describe('confidence calibration', () => {
  it('exact client + a single stage verb clears the threshold', () => {
    const clients = [mkClient('Verma Dental', 'cold')];
    const r = parse('Verma Dental is interested', { clients, today: TODAY });
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('exact client + a single service match clears the threshold', () => {
    const clients = [mkClient('Bright Smile Dental Clinic', 'cold')];
    const r = parse('Bright Smile Dental Clinic signed Local SEO', { clients, today: TODAY });
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('exact client + a single completion match clears the threshold', () => {
    const clients = [mkClient('Bright Smile Dental Clinic', 'building')];
    const r = parse('logo done for Bright Smile Dental Clinic', { clients, today: TODAY });
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('an ambiguous client + a single verb stays under the threshold', () => {
    const clients = [mkClient('Sharma Clinic'), mkClient('Sharma Dental')];
    const r = parse('sharma called', { clients, today: TODAY });
    expect(r.confidence).toBeLessThan(0.6);
  });

  it('an ambiguous client + two stacked verbs still stays under the threshold', () => {
    // The regression case: two full-strength verb bonuses (0.3 each) would
    // reach exactly 0.6 on their own with no client ever resolving — a
    // parse that filed nothing, passing the bar as if it were trustworthy.
    const clients = [mkClient('Sharma Clinic'), mkClient('Sharma Dental')];
    const r = parse('sharma called then confirmed', { clients, today: TODAY });
    expect(r.actions).toEqual([]);
    expect(r.confidence).toBeLessThan(0.6);
  });

  it('a fuzzy client match + a single verb intentionally stays under the threshold', () => {
    // Documented, not a gap: fuzzy resolution is itself a lower-confidence
    // identification than an exact match, so it doesn't inherit the same
    // full-strength combination the exact-match case gets.
    const clients = [mkClient('Bright Smile Dental Clinic', 'cold')];
    const r = parse('bright smile is interested', { clients, today: TODAY });
    expect(r.confidence).toBeLessThan(0.6);
  });

  it('no client at all + a single verb stays well under the threshold', () => {
    const clients = [mkClient('Verma Dental', 'cold')];
    const r = parse('someone is interested', { clients, today: TODAY });
    expect(r.confidence).toBeLessThan(0.6);
  });
});
