import { describe, expect, it } from 'vitest';
import { resolveClient } from './clients';
import { mkClient } from './testHelpers';

describe('resolveClient', () => {
  it('matches an exact (case-insensitive) full name', () => {
    const clients = [mkClient('Bright Smile Dental Clinic'), mkClient('Verma Dental')];
    const m = resolveClient('paid 25k advance from bright smile dental clinic', clients);
    expect(m.kind).toBe('exact');
    expect(m.client?.name).toBe('Bright Smile Dental Clinic');
  });

  it('resolves a partial/fuzzy mention via word overlap', () => {
    const clients = [mkClient('Bright Smile Dental Clinic'), mkClient('Verma Dental')];
    const m = resolveClient('bright smile paid advance', clients);
    expect(m.kind).toBe('fuzzy');
    expect(m.client?.name).toBe('Bright Smile Dental Clinic');
  });

  it('returns ambiguous, not a guess, when two clients tie', () => {
    const clients = [mkClient('Sharma Clinic'), mkClient('Sharma Dental')];
    const m = resolveClient('sharma paid 10k advance', clients);
    expect(m.kind).toBe('ambiguous');
    expect(m.client).toBeNull();
  });

  it('returns none when nothing matches', () => {
    const clients = [mkClient('Bright Smile Dental Clinic')];
    const m = resolveClient('random unrelated note about nothing', clients);
    expect(m.kind).toBe('none');
    expect(m.client).toBeNull();
  });

  it('does not match on a short generic single word', () => {
    const clients = [mkClient('Care Dental Studio')];
    const m = resolveClient('the care package arrived', clients);
    expect(m.client).toBeNull();
  });
});
