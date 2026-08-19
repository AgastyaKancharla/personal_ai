import { describe, expect, it } from 'vitest';
import { matchCompletion } from './completion';

describe('matchCompletion', () => {
  it('matches "X done for Y"', () => {
    const m = matchCompletion('logo done for Bright Smile');
    expect(m?.item).toBe('logo');
  });

  it('matches "finished the X"', () => {
    const m = matchCompletion('finished the website');
    expect(m?.item).toBe('website');
  });

  it('matches "X is live"', () => {
    const m = matchCompletion('the new site is live');
    expect(m?.item).toBe('the new site');
  });

  it('returns null when nothing completion-shaped is present', () => {
    expect(matchCompletion('called Bright Smile, interested')).toBeNull();
  });
});
