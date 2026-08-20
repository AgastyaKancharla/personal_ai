import { TrackerState } from './types';
import { STAGES, stageIndex } from './catalogue';
import { addDays, iso, mondayOf, parseIso, today } from './dates';

export type InsightTone = 'urgent' | 'warn' | 'info';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  reason: string;
  clientId?: string;
}

const DAY_MS = 86400000;
const TONE_WEIGHT: Record<InsightTone, number> = { urgent: 3, warn: 2, info: 1 };

// Deterministic rules over this week's tasks and the client pipeline — no
// model call. Same "rules first" approach as lib/parse/: free, instant,
// and it only ever sees data already in TrackerState (no calendar/LLM I/O).
export function weeklyInsights(data: TrackerState, refIso: string = today()): Insight[] {
  const t = refIso;
  const refDate = parseIso(refIso);
  const sunday = iso(addDays(mondayOf(refDate), 6));
  const daysSince = (d: string) => Math.round((refDate.getTime() - parseIso(d).getTime()) / DAY_MS);

  const out: Insight[] = [];

  const upcoming = data.tasks.filter((x) => !x.done && x.date > t && x.date <= sunday);
  if (upcoming.length > 0) {
    out.push({
      id: 'tasks-open',
      tone: 'info',
      title: `${upcoming.length} more task${upcoming.length > 1 ? 's' : ''} due this week`,
      reason: upcoming.slice(0, 3).map((x) => x.title).join(' · ')
    });
  }

  data.clients
    .filter((c) => c.stage !== 'delivered' && c.nextFollowUp && c.nextFollowUp > t && c.nextFollowUp <= sunday)
    .forEach((c) => {
      out.push({
        id: `followup-${c.id}`,
        tone: 'warn',
        title: `Call ${c.name} by ${c.nextFollowUp.slice(8)}/${c.nextFollowUp.slice(5, 7)}`,
        reason: `Follow-up scheduled this week · ${STAGES[stageIndex(c.stage)].label}`,
        clientId: c.id
      });
    });

  data.clients
    .filter((c) => c.stage !== 'delivered' && c.stage !== 'cold' && !c.nextFollowUp)
    .forEach((c) => {
      out.push({
        id: `stalled-${c.id}`,
        tone: 'warn',
        title: `${c.name} has no next follow-up set`,
        reason: `Sitting at ${STAGES[stageIndex(c.stage)].label} with nothing scheduled`,
        clientId: c.id
      });
    });

  data.clients
    .filter((c) => c.stage === 'quoted' && Number(c.quoteValue) > 0 && !(Number(c.advance) > 0))
    .forEach((c) => {
      const quotedOn = c.history.quoted;
      const days = quotedOn ? daysSince(quotedOn) : 0;
      if (days >= 3) {
        out.push({
          id: `advance-${c.id}`,
          tone: 'urgent',
          title: `Advance still pending — ${c.name}`,
          reason: `Quoted ${days} day${days > 1 ? 's' : ''} ago, no advance logged yet`,
          clientId: c.id
        });
      }
    });

  data.clients
    .filter((c) => c.stage === 'building' && c.deliverables.length > 0 && c.deliverables.every((d) => !d.done))
    .forEach((c) => {
      out.push({
        id: `noprogress-${c.id}`,
        tone: 'warn',
        title: `No progress logged for ${c.name}`,
        reason: `${c.deliverables.length} promises listed, none checked off yet`,
        clientId: c.id
      });
    });

  return out.sort((a, b) => TONE_WEIGHT[b.tone] - TONE_WEIGHT[a.tone]);
}
