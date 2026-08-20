import { Client } from '../types';
import { Span } from './types';

export interface NewClientsMatch {
  names: string[];
  span: Span;
}

// A common word right before an enumerated name list. Common false-positive
// shapes ("call all clients tomorrow", "clients are unhappy") never produce
// a real multi-name list, so requiring at least two comma/"and"-separated
// segments below is what actually keeps this matcher from over-firing —
// the trigger itself just needs to find where the list would start.
const TRIGGER = /\bclients\b\s*(?:are|:)?\s*/i;

// Words that show up after "clients" in a sentence that isn't actually
// declaring new ones — reject the whole match rather than create a client
// named "tomorrow" or "unhappy".
const STOPWORDS = new Set([
  'today', 'tomorrow', 'yesterday', 'now', 'later', 'soon', 'morning', 'evening', 'night',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'happy', 'unhappy', 'angry', 'busy', 'waiting', 'pending', 'done', 'ready'
]);

/**
 * Matches a batch declaration of brand-new client names ("3 clients A, B
 * and C", "other two clients are A and B") — distinct from resolveClient,
 * which only ever resolves a note against clients that already exist.
 * Real logged failures (parse_log, 2026-08-20): the founder tried this
 * phrasing expecting quick-add to create the clients, and nothing fired.
 */
export function matchNewClients(text: string, existing: Client[]): NewClientsMatch | null {
  const m = TRIGGER.exec(text);
  if (!m) return null;

  const rest = text.slice(m.index + m[0].length);
  const stop = rest.search(/[.!?]/);
  const listText = (stop === -1 ? rest : rest.slice(0, stop)).trim();
  if (!listText) return null;

  const rawNames = listText
    .split(/\s*,\s*|\s+and\s+/i)
    .map((n) => n.trim())
    .filter(Boolean);

  // Require a genuine enumeration — a single trailing word after "clients"
  // is almost always an unrelated clause, not a name.
  if (rawNames.length < 2) return null;
  if (rawNames.some((n) => STOPWORDS.has(n.toLowerCase()))) return null;

  const existingLower = existing.map((c) => c.name.toLowerCase());
  const names = rawNames.filter((n) => !existingLower.includes(n.toLowerCase())).map((n) => n.replace(/\s+/g, ' '));

  if (!names.length) return null;

  return { names, span: [m.index, m.index + m[0].length + listText.length] };
}
