import { Action, Client } from '../types';

export interface ParseContext {
  clients: Client[];
  /** YYYY-MM-DD. Injected, never read from the system clock inside the engine. */
  today: string;
}

export interface ParseResult {
  actions: Action[];
  /** 0-1, honest — an inflated score sends bad parses through without review. */
  confidence: number;
  engine: 'rules' | 'api';
  /** Under 9 words, shown to the user. */
  summary: string;
  /** Text no matcher claimed — drives confidence down. */
  unconsumed: string;
}

/** A matched span in the original input text, [start, end) character offsets. */
export type Span = [number, number];
