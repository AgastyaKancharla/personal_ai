import { describe, expect, it } from 'vitest';
import { scanStageVerbs } from './stageVerbs';
import { StageKey } from '../types';

describe('scanStageVerbs', () => {
  const cases: [string, StageKey][] = [
    ['called Bright Smile', 'cold'],
    ['cold called them', 'cold'],
    ['rang them again', 'cold'],
    ['they are interested', 'interested'],
    ['seems keen on it', 'interested'],
    ['wants to move ahead', 'interested'],
    ['met them at the clinic', 'meeting'],
    ['had a demo', 'meeting'],
    ['visited the clinic', 'meeting'],
    ['confirmed the deal', 'finalised'],
    ['finalised everything', 'finalised'],
    ['finalized everything', 'finalised'],
    ['locked it in', 'finalised'],
    ['agreed to proceed', 'finalised'],
    ['quote sent', 'quoted'],
    ['sent the quote', 'quoted'],
    ['shared the quotation', 'quoted'],
    ['advance received', 'advance'],
    ['paid the amount', 'advance'],
    ['payment received today', 'advance'],
    ['started work', 'building'],
    ['building the site', 'building'],
    ['in progress now', 'building'],
    ['delivered the project', 'delivered'],
    ['handed over the keys', 'delivered'],
    ['completed the work', 'delivered'],
    ['site is live', 'delivered'],
    ['all done', 'delivered']
  ];

  it.each(cases)('%s -> %s', (text, stage) => {
    const verbs = scanStageVerbs(text);
    expect(verbs.map((v) => v.stage)).toContain(stage);
  });

  it('does not double-count an overlapping longer phrase and its shorter substring', () => {
    const verbs = scanStageVerbs('cold called Bright Smile');
    expect(verbs).toHaveLength(1);
    expect(verbs[0].stage).toBe('cold');
  });

  it('finds multiple distinct verbs in reading order', () => {
    const verbs = scanStageVerbs('called them, now interested');
    expect(verbs.map((v) => v.stage)).toEqual(['cold', 'interested']);
  });

  it('excludes spans already claimed elsewhere (e.g. by the completion matcher)', () => {
    const text = 'logo done for Bright Smile';
    const doneIdx = text.indexOf('done');
    const verbs = scanStageVerbs(text, [[doneIdx, doneIdx + 4]]);
    expect(verbs.map((v) => v.stage)).not.toContain('delivered');
  });
});
