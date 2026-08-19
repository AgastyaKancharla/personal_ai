# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev         # local dev server (localhost:3000), needs .env.local — see .env.example
npm run build        # production build
npm run start         # run the production build
npm run typecheck     # tsc --noEmit
npm run lint          # next lint
```

There is no test suite yet. `npm run build` and `npm run typecheck` are the checks to run
before pushing.

## What this is

**Personal AI** — a password-gated Next.js (App Router) web app for the founder's personal
schedule/tasks and the AgastyaOne client pipeline, deployed to Vercel. It replaced an earlier,
unrelated NAP citation-audit tool that used to live in this repo; there is no relationship
between the two beyond sharing this git history.

`docs/persona-brain-spec.md` is the forward-looking build plan (phased roadmap to replace the
Anthropic-powered quick-add with a self-hosted, free rules-engine + fine-tuned model pipeline).
Read it before starting work on parsing/quick-add/auth/schema changes — those are its Phase 0–5.

## Architecture

**Everything is server-gated.** `middleware.ts` runs on every request except `/login` and
`/api/login`, and rejects (401 for `/api/*`, redirect to `/login` otherwise) unless a valid
HMAC-signed session cookie (`lib/auth.ts`, Web Crypto only — no `node:crypto`, so it works
identically in the edge-runtime middleware and in API routes) is present. There is a single
shared password (`APP_PASSWORD`); this is a single-owner tool, not a multi-account system.

**State is one Supabase row, read only server-side.** All app data (`clients` + `tasks`, with
deliverables nested under each client) lives in a single `tracker_state` row as jsonb
(`supabase/schema.sql`). `SUPABASE_SERVICE_ROLE_KEY` is read only inside `app/api/*/route.ts`
files (`lib/supabase.ts`) and never reaches the browser. RLS is enabled on `tracker_state`
with zero policies, so even a leaked anon key can't touch it — only the service-role key can,
by design. The client polls `GET /api/data` on load and debounce-saves the whole state via
`PUT /api/data` 500ms after any change (see `app/page.tsx`).

**Quick-add is a server-side LLM call, not client logic.** `components/QuickAdd.tsx` posts raw
text to `POST /api/quick-add`, which builds a prompt (client roster, today's date, the 14-item
`SERVICES` catalogue) and calls the Anthropic API with `ANTHROPIC_API_KEY` (server-only). The
model returns a structured `QuickAddAction[]` (defined in `lib/types.ts`), which
`lib/actions.ts`'s `applyActions` interprets client-side against local state — fuzzy-matching
client names, creating clients on demand, updating stage/money/deliverables/tasks. This
action schema is the same shared contract `docs/persona-brain-spec.md` versions and extends.

**Domain model** (`lib/types.ts`, `lib/catalogue.ts`):
- A `Client` moves through a fixed 8-stage pipeline (`cold` → ... → `delivered`, see `STAGES`
  in `lib/catalogue.ts`) and carries a `history` map of stage → date it first entered that
  stage, plus a `deliverables` checklist.
- `CATALOGUE`/`SERVICES` in `lib/catalogue.ts` is AgastyaOne's fixed list of 14 sellable
  services, each with a checklist of implementation steps; selecting one via quick-add or the
  client sheet's "Templates" tab attaches those steps as deliverables.
- `lib/actions.ts` (`makeActions`) is the single place that mutates `TrackerState` — both the
  UI's direct interactions (checkboxes, forms) and quick-add's `applyActions` go through it.

**UI shell**: `app/page.tsx` owns all state and a 4-tab nav (Today/Week/Month/Clients, each
`components/*View.tsx`); `components/ClientSheet.tsx` is the full-screen editor for one client
(stage rail, money, deliverables, notes, follow-up date). Styling is inline `style` objects
against the token palette in `lib/theme.ts` (teal/orange AgastyaOne brand), not a component
library — Tailwind is present but used sparingly (layout utilities only).

## Known constraints

- Next.js is pinned to `14.2.35`; a bundled `postcss` vulnerability is only fixed by the
  Next 16 major upgrade. Not urgent for this single-user app since it doesn't use React
  Server Actions (the vector the related advisory concerns) — see README's Security notes.
- No automated tests exist. `docs/persona-brain-spec.md` Phase 1 specifically requires unit
  tests for the rules engine it introduces ("the test file is the specification") — that
  precedent should extend to any other logic-heavy code added here.
