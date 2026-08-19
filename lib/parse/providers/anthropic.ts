import Anthropic from '@anthropic-ai/sdk';
import { SERVICES } from '../../catalogue';
import { dowOf, parseIso } from '../../dates';
import { ParseContext, ParseResult } from '../types';
import { Provider } from './types';

function buildPrompt(note: string, ctx: ParseContext): string {
  const roster = ctx.clients.length ? ctx.clients.map((c) => `${c.name} [${c.stage}]`).join('; ') : 'none yet';

  return `Today is ${ctx.today}, a ${dowOf(parseIso(ctx.today))}. Existing clients: ${roster}.

The person runs AgastyaOne, a software and marketing agency in India selling to local businesses. They also use this tool as their own personal schedule/task brain. A local rules engine already tried to parse their note and couldn't do it confidently — turn it into structured actions for their tracker.

Return ONLY a JSON object. No markdown fences, no preamble:
{"actions":[...],"summary":"under 9 words, plain confirmation"}

Allowed actions:
{"type":"task","title":string,"clientName":string|null,"date":"YYYY-MM-DD"}
{"type":"client","name":string,"phone":string|null}
{"type":"stage","clientName":string,"stage":"cold|interested|meeting|finalised|quoted|advance|building|delivered"}
{"type":"money","clientName":string,"quoteValue":number|null,"advance":number|null}
{"type":"deliverable","clientName":string,"items":[string]}
{"type":"service","clientName":string,"service":"exact solution name from the list below"}
{"type":"done","clientName":string,"match":string}
{"type":"tick","match":string}
{"type":"followup","clientName":string,"date":"YYYY-MM-DD"}

AgastyaOne solutions (use the "service" action when one is sold or started — it attaches the full implementation checklist):
${SERVICES.map((s) => s.name).join(', ')}

Rules:
- Resolve relative dates against today. "Friday" means the coming Friday. "Next week" means the coming Monday. Default to today when no date is given.
- Indian money shorthand: 15k = 15000, 1.5 lakh or 1.5L = 150000, 2cr = 20000000.
- Match client names loosely against the existing list. Only introduce a new client when nothing is close.
- Personal tasks with no business tied to them should use "task" with clientName null.
- Stage words: called or cold call = cold, interested = interested, met or meeting = meeting, confirmed or finalised = finalised, quote sent = quoted, advance or paid = advance, started work = building, done or delivered = delivered.
- A payment implies a money action, not a task.
- When they mention selling, starting or signing a solution, use a "service" action rather than inventing deliverables.
- Keep task titles short and in their own words.
- One note can produce several actions.
- When ambiguous which client is meant, prefer leaving it out over guessing wrong.

Note: "${note}"`;
}

export const anthropicProvider: Provider = {
  async parse(text: string, ctx: ParseContext): Promise<ParseResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      messages: [{ role: 'user', content: buildPrompt(text, ctx) }]
    });

    let raw = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    const a = raw.indexOf('{');
    const b = raw.lastIndexOf('}');
    if (a === -1 || b === -1) throw new Error('The model did not return structured actions.');

    const parsed = JSON.parse(raw.slice(a, b + 1));
    if (!parsed.actions || !Array.isArray(parsed.actions) || !parsed.actions.length) {
      throw new Error('Nothing to file in that.');
    }

    return {
      actions: parsed.actions,
      confidence: 1,
      engine: 'api',
      summary: parsed.summary || `Filed ${parsed.actions.length} update${parsed.actions.length > 1 ? 's' : ''}`,
      unconsumed: ''
    };
  }
};
