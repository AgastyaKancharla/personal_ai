import { describe, expect, it } from 'vitest';
import { parse } from './index';
import { mkClient } from './testHelpers';
import { addDays, iso, parseIso } from '../dates';

const TODAY = '2026-08-19'; // Wednesday

describe('parse — integration', () => {
  it('handles the required multi-action sentence: called, interested, meeting on a future date', () => {
    const clients = [mkClient('Smile Dental', 'cold')];
    const result = parse('called Smile Dental, interested, meeting Thursday', { clients, today: TODAY });

    const stageActions = result.actions.filter((a) => a.type === 'stage');
    const taskActions = result.actions.filter((a) => a.type === 'task');

    expect(stageActions.map((a: any) => a.stage)).toEqual(['cold', 'interested']);
    expect(taskActions).toHaveLength(1);
    expect((taskActions[0] as any).date).toBe(iso(addDays(parseIso(TODAY), 1)));
    expect((taskActions[0] as any).clientName).toBe('Smile Dental');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('returns zero actions and low confidence on nonsense input, without crashing', () => {
    const clients = [mkClient('Smile Dental')];
    const result = parse('asdkj qwoeiu random text about nothing at all', { clients, today: TODAY });
    expect(result.actions).toEqual([]);
    expect(result.confidence).toBeLessThan(0.3);
  });

  it('parses a clean money entry with high confidence, above the escalation threshold', () => {
    const clients = [mkClient('Bright Smile Dental Clinic', 'quoted')];
    const result = parse('Bright Smile Dental Clinic paid 25k advance', { clients, today: TODAY });
    expect(result.actions).toEqual([
      { type: 'money', clientName: 'Bright Smile Dental Clinic', quoteValue: null, advance: 25000 }
    ]);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result.engine).toBe('rules');
  });

  it('does not emit a money action when the client is ambiguous', () => {
    const clients = [mkClient('Sharma Clinic'), mkClient('Sharma Dental')];
    const result = parse('sharma paid 10k advance', { clients, today: TODAY });
    expect(result.actions).toEqual([]);
    expect(result.confidence).toBeLessThan(0.6);
  });

  it('resolves a service sale into a service action', () => {
    const clients = [mkClient('Verma Dental', 'finalised')];
    const result = parse('Verma Dental signed up for GBP', { clients, today: TODAY });
    expect(result.actions).toContainEqual({
      type: 'service',
      clientName: 'Verma Dental',
      service: 'Google Business Profile Optimization'
    });
  });

  it('resolves a completion phrase against a known client into a done action', () => {
    const clients = [mkClient('Nissa Dental', 'building')];
    const result = parse('logo done for Nissa Dental', { clients, today: TODAY });
    expect(result.actions).toContainEqual({ type: 'done', clientName: 'Nissa Dental', match: 'logo' });
  });

  it('falls back to a tick when no client is mentioned in a completion phrase', () => {
    const result = parse('finished the deck', { clients: [], today: TODAY });
    expect(result.actions).toContainEqual({ type: 'tick', match: 'deck' });
  });
});
