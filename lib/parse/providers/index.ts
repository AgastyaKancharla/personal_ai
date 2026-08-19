import { Provider } from './types';
import { anthropicProvider } from './anthropic';

export type { Provider } from './types';

/** Off by default; enabled purely by the presence of an env key. Deleting
 * anthropic.ts and this file breaks nothing else — the caller only ever
 * sees the Provider interface. */
export function getProvider(): Provider | null {
  return process.env.ANTHROPIC_API_KEY ? anthropicProvider : null;
}
