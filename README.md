# Personal AI

Your personal schedule, tasks, and AgastyaOne client pipeline in one
password-protected web app — deployed as a real website so it's the same
board on your phone, laptop, or any other device, not a Claude artifact tied
to one chat.

Built with Next.js (App Router) + TypeScript, Supabase for storage, and the
Anthropic API for a natural-language "quick add" bar: type a note like it,
it turns into structured tasks, client updates, or money entries.

---

## ✨ What it does

- **Today / Week / Month / Clients** views — daily task list with overdue
  carry-over, a 7-day planner, a month calendar with revenue stats, and a
  client pipeline board grouped by stage (cold call → delivered).
- **Client sheet** — stage tracker, quote/advance/balance, a
  promised-vs-built deliverables checklist (add one at a time, paste a
  quote's scope lines, or drop in a full AgastyaOne service template),
  notes, and next follow-up date.
- **Quick add bar** — type anything ("Meeting with Nissa Dental Friday",
  "15k advance from Sharma Clinic", "sold local SEO to Verma Dental") and
  it's parsed server-side into structured actions and filed automatically.
  Personal tasks with no client attached work the same way.
- **Password-gated, synced everywhere** — one shared password unlocks a
  signed session cookie; all data lives in Supabase, so every device you log
  into sees the same board in real time (500ms debounced autosave).

---

## 🏗️ Architecture

```
Browser (any device)
   │  password login → signed session cookie
   ▼
Next.js app (Vercel)
   ├─ middleware.ts        gates every route except /login
   ├─ /api/data            GET/PUT the whole {clients, tasks} state
   ├─ /api/quick-add       note → Claude → structured actions (server-side key)
   └─ /api/login /logout   password check → signed cookie
   │
   ▼
Supabase (Postgres)
   └─ tracker_state        single jsonb row, service-role key only, RLS on
```

No browser automation, no Docker, no persistent container needed — this is
a standard serverless Next.js app.

---

## 🚀 Deploy (Vercel)

1. Push this repo to GitHub (already done if you're reading this on the
   deployed branch) and import it in Vercel.
2. Create a [Supabase](https://supabase.com) project, then run
   [`supabase/schema.sql`](supabase/schema.sql) once against it — via the
   SQL Editor in the dashboard, or the Supabase CLI. This creates the single
   `tracker_state` table the app reads and writes.
3. In Vercel → Project Settings → Environment Variables, set the five
   variables from [`.env.example`](.env.example):

   | Variable | Where to get it |
   | --- | --- |
   | `APP_PASSWORD` | Pick one — this is the password that unlocks the app. |
   | `SESSION_SECRET` | `openssl rand -hex 32` |
   | `SUPABASE_URL` | Supabase → Project Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` secret (never expose this client-side — it's only read in server-side API routes here) |
   | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |

4. Deploy. Open the URL on any device, enter `APP_PASSWORD`, and you're in —
   same board everywhere.

## 🧑‍💻 Local development

```bash
npm install
cp .env.example .env.local   # fill in the five variables above
npm run dev
# http://localhost:3000
```

`npm run build` / `npm run typecheck` are the same checks CI-equivalent
tooling would run — both currently pass clean.

---

## 🔒 Security notes

- Every route except `/login` and `/api/login` is gated by
  `middleware.ts`, which verifies an HMAC-signed session cookie
  (`SESSION_SECRET`). There is no per-user account system — this is a
  single shared password for a single-owner tool, by design.
- The Supabase **service role key** is read only inside
  `app/api/*/route.ts` files (server-side, `runtime = 'nodejs'`/`'edge'`
  but never sent to the browser). `tracker_state` has RLS enabled with zero
  policies, so even a leaked anon/publishable key couldn't read or write it
  — only the service role key can, and that never leaves the server.
- The Anthropic API key is likewise server-only, called from
  `app/api/quick-add/route.ts`.
- Known advisory: Next.js 14.2.x bundles a `postcss` version flagged by
  `npm audit` (fixed only in Next 16, a breaking major upgrade). This app
  doesn't use React Server Actions/`"use server"` functions, which is the
  vector the related Next.js advisory concerns — worth revisiting when a
  15.x/16.x migration is scheduled, not urgent for this single-user tool.
