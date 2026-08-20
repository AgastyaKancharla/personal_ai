'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import { C, DISPLAY } from '@/lib/theme';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok) {
        const out = await res.json().catch(() => ({}));
        setErr(out.error || 'Wrong password.');
        setBusy(false);
        return;
      }
      router.replace(params.get('next') || '/');
      router.refresh();
    } catch (e) {
      setErr('Could not reach the server. Try again.');
      setBusy(false);
    }
  };

  return (
    <div style={{ background: C.paper, minHeight: '100vh' }} className="flex items-center justify-center px-4">
      <div className="w-full" style={{ maxWidth: 340 }}>
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="rounded-full flex items-center justify-center" style={{ width: 34, height: 34, background: C.tealDeep }}>
            <Lock size={15} color="#8FBDBB" />
          </div>
          <span style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 800, color: C.ink }}>Personal AI</span>
        </div>

        {err && (
          <div className="rounded-xl px-3 py-2 mb-3" style={{ background: C.orangeSoft, border: `1px solid ${C.orange}44` }}>
            <span style={{ fontSize: 12.5, color: C.orange }}>{err}</span>
          </div>
        )}

        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Password"
          className="w-full rounded-xl px-3.5 outline-none mb-3"
          style={{ height: 46, fontSize: 15, background: C.white, border: `1px solid ${C.line}`, color: C.ink }}
        />
        <button
          onClick={submit}
          disabled={busy}
          className="w-full rounded-xl flex items-center justify-center gap-2"
          style={{ height: 46, background: busy ? C.muted : C.ink, color: C.white, fontSize: 14, fontWeight: 600 }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
