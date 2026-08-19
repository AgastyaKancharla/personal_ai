import { Span } from './types';

export interface CompletionMatch {
  item: string;
  span: Span;
}

// Checked in order; first match wins.
const PATTERNS = [/^(.+?)\s+done for\s+.+$/i, /^(?:.*?\bfinished\s+(?:the\s+)?)(.+)$/i, /^(.+?)\s+is live\b/i];

export function matchCompletion(text: string): CompletionMatch | null {
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (m && m[1] && m[1].trim().length > 0) {
      return { item: m[1].trim(), span: [0, m[0].length] };
    }
  }
  return null;
}
