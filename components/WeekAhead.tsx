'use client';

import { ChevronRight, Sparkles } from 'lucide-react';
import { C } from '@/lib/theme';
import { TrackerState } from '@/lib/types';
import { Insight, InsightTone, weeklyInsights } from '@/lib/insights';
import { Card, Empty, Eyebrow } from './Primitives';

const TONE_COLOR: Record<InsightTone, string> = {
  urgent: C.orange,
  warn: C.orange,
  info: C.teal
};

function InsightRow({ insight, onOpenClient }: { insight: Insight; onOpenClient: (id: string) => void }) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
      <span className="shrink-0 rounded-full" style={{ width: 6, height: 6, marginTop: 6, background: TONE_COLOR[insight.tone] }} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 600 }}>{insight.title}</div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{insight.reason}</div>
      </div>
      {insight.clientId && (
        <button onClick={() => onOpenClient(insight.clientId!)} className="shrink-0" style={{ marginTop: 2 }}>
          <ChevronRight size={14} color={C.muted} />
        </button>
      )}
    </div>
  );
}

export function WeekAhead({ data, onOpenClient }: { data: TrackerState; onOpenClient: (id: string) => void }) {
  const insights = weeklyInsights(data);

  return (
    <Card>
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles size={12} color={C.orange} />
        <Eyebrow tone={C.ink}>This week needs attention</Eyebrow>
      </div>
      {insights.length === 0 ? (
        <Empty>Nothing at risk this week — you&apos;re on top of it.</Empty>
      ) : (
        insights.map((ins) => <InsightRow key={ins.id} insight={ins} onOpenClient={onOpenClient} />)
      )}
    </Card>
  );
}
