'use client';

import { BODY, C } from '@/lib/theme';

export function Eyebrow({ children, tone = C.muted }: { children: React.ReactNode; tone?: string }) {
  return (
    <div
      style={{ fontFamily: BODY, fontSize: 10, letterSpacing: '0.14em', color: tone, fontWeight: 600 }}
      className="uppercase mb-2"
    >
      {children}
    </div>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.white, border: `1px solid ${C.line}`, ...style }}>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 text-center" style={{ border: `1px dashed ${C.line}`, color: C.muted, fontSize: 13 }}>
      {children}
    </div>
  );
}
