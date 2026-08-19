import { ParseContext, ParseResult } from '../types';

/** A pluggable fallback engine. Swapping or deleting the implementation
 * behind this interface should never require touching the calling route. */
export interface Provider {
  parse(text: string, ctx: ParseContext): Promise<ParseResult>;
}
