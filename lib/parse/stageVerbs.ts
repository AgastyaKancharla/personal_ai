import { StageKey } from '../types';
import { Span } from './types';

// Longer/more-specific phrases first: when scanning, a later pattern's match
// is dropped if it overlaps a span an earlier (higher-priority) pattern
// already claimed. This stops "cold called" from also firing plain "called".
const STAGE_VERB_PATTERNS: [RegExp, StageKey][] = [
  [/\bquote sent\b/gi, 'quoted'],
  [/\bsent (?:the )?quote\b/gi, 'quoted'],
  [/\bquotation\b/gi, 'quoted'],
  [/\bpayment received\b/gi, 'advance'],
  [/\badvance\b/gi, 'advance'],
  [/\bpaid\b/gi, 'advance'],
  [/\bcold called\b/gi, 'cold'],
  [/\bcalled\b/gi, 'cold'],
  [/\brang\b/gi, 'cold'],
  [/\binterested\b/gi, 'interested'],
  [/\bkeen\b/gi, 'interested'],
  [/\bwants\b/gi, 'interested'],
  [/\bmet\b/gi, 'meeting'],
  [/\bmeeting\b/gi, 'meeting'],
  [/\bvisited\b/gi, 'meeting'],
  [/\bdemo\b/gi, 'meeting'],
  [/\bconfirmed\b/gi, 'finalised'],
  [/\bfinalised\b/gi, 'finalised'],
  [/\bfinalized\b/gi, 'finalised'],
  [/\blocked\b/gi, 'finalised'],
  [/\bagreed\b/gi, 'finalised'],
  [/\bstarted work\b/gi, 'building'],
  [/\bstarted\b/gi, 'building'],
  [/\bbuilding\b/gi, 'building'],
  [/\bin progress\b/gi, 'building'],
  [/\bhanded over\b/gi, 'delivered'],
  [/\bdelivered\b/gi, 'delivered'],
  [/\bcompleted\b/gi, 'delivered'],
  [/\blive\b/gi, 'delivered'],
  [/\bdone\b/gi, 'delivered']
];

export interface StageVerbMatch {
  stage: StageKey;
  span: Span;
}

function overlaps(a: Span, b: Span): boolean {
  return a[0] < b[1] && a[1] > b[0];
}

/** All stage-verb occurrences in `text`, in reading order. `exclude` spans
 * (e.g. already claimed by the completion matcher) are skipped entirely. */
export function scanStageVerbs(text: string, exclude: Span[] = []): StageVerbMatch[] {
  const claimed: Span[] = [...exclude];
  const results: StageVerbMatch[] = [];

  for (const [pattern, stage] of STAGE_VERB_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const span: Span = [m.index, m.index + m[0].length];
      if (!claimed.some((c) => overlaps(c, span))) {
        claimed.push(span);
        results.push({ stage, span });
      }
      if (m[0].length === 0) re.lastIndex++; // safety against zero-width matches
    }
  }

  results.sort((a, b) => a.span[0] - b.span[0]);
  return results;
}
