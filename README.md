# 100% Self-Hosted Local Citation & NAP Audit Suite

> **Deploy target: Railway / Render / Fly.io / any Docker host — not Vercel.**
> This service launches a real Chromium browser via Playwright, which needs a
> persistent container and can run past typical serverless timeouts. Earlier
> deploy attempts on Vercel (`api/index.ts` + `vercel.json`, now removed)
> repeatedly failed for exactly this reason. Use the Dockerfile below instead.

**⚠️ Action required after pulling this commit:** `package.json` and the
`Dockerfile` were bumped from Playwright `1.42.0` to `1.62.0` (see fix below),
but `package-lock.json` was **not** regenerated here — there was no Node.js
available to safely do it. Before deploying, run `npm install` locally (not
`npm ci`) and commit the updated `package-lock.json`, or `npm ci` will fail
in the Docker build because the lockfile won't match `package.json`.

**Recent fixes (this session):**
- Fixed every directory audit failing with "Chromium launch failed:
  Executable doesn't exist... Looks like Playwright was just updated to
  1.62.0. Please update docker image as well." — the deployed container's
  installed `playwright-core` had drifted to `1.62.0` while the Dockerfile's
  base image (`mcr.microsoft.com/playwright:v1.42.0-jammy`) still shipped
  `1.42.0`'s Chromium build, so the browser could never launch and every
  directory silently reported "not found." Pinned both to `1.62.0` so they
  can't drift apart again — **requires the `npm install` step above.**
- Added a login-gated session (`INTERNAL_APP_PASSWORD` / `SESSION_SECRET`) in
  front of the dashboard and every `/api/*` route — previously anything,
  including the endpoint that queues real writes to a client's live Google
  Business Profile, was open to anyone who could reach the URL.
- Implemented the Bing Web Search and Google Programmable Search Engine (CSE)
  discovery sources (`bingSearch.ts`, `googleCse.ts`), which were wired into
  the orchestrator but previously always returned `[]` regardless of config.
- Added `supabase/audit_queue.sql` with the `audit_jobs`/`audit_results`
  tables that `worker.ts`'s async queue mode (Option C) polls — they were
  referenced in code but never defined in any schema file.
- Added a client-facing, shareable, print/PDF-friendly report page at
  `/report/:id` ("🔗 Copy Client Report Link" on a completed audit).

**Previous session fixes:**
- Fixed TypeScript strict-null build errors introduced when `SourceOfTruthNAP`
  fields became optional (`diffEngine.ts` + 3 directory adapters).
- Removed a serious bug present in every directory adapter: on scrape
  failure, the `catch` block was returning the *source-of-truth NAP as if it
  were the scraped listing* — meaning a directory that was actually blocked,
  timed out, or had no listing at all got silently reported as "found,
  consistent." Adapters now throw on failure so it correctly surfaces as an
  `ERROR` result instead of a false positive.
- Fixed browser-instance leaks: each adapter now closes its Playwright
  browser in a `finally` block, so a failed page load no longer leaves the
  browser process running (this matters a lot on a long-lived container —
  leaked browsers will eventually OOM the host).
- `npm start` / `npm run worker` now run the compiled `dist/` output instead
  of `ts-node` on raw source — matches what the Dockerfile actually builds,
  and means `typescript`/`ts-node` don't need to ship in the runtime image.
  Use `npm run dev` / `npm run dev:worker` for local iteration with ts-node.
- Removed `vercel.json` and `api/index.ts` (the Vercel serverless wrapper).

A production-grade, 100% self-hosted Local Citation & NAP Audit web dashboard and worker service built in Node.js, TypeScript, Express, and Playwright. Operates with zero third-party browser SaaS subscriptions (no Browserless/Apify/ZenRows).

---

## 🏗️ Architecture

```
                               ┌──────────────────────────────────────────────┐
                               │   Interactive Web Dashboard (Built-in UI)    │
                               │   - Form to enter business details           │
                               │   - Real-time audit progress & score card    │
                               │   - Export Markdown / JSON reports           │
                               └──────────────────────┬───────────────────────┘
                                                      │ (Triggers audit)
                                                      ▼
 ┌──────────────────────┐  (Optional DB Queue)  ┌──────────────────────────────┐
 │ Next.js CRM (Vercel) ├──────────────────────▶│  Self-Hosted Container App   │──▶ Playwright Chromium ──▶ [ Justdial / Practo / GBP / Sulekha ]
 └──────────────────────┘                       │  (Railway / Render / Docker) │
                                                └──────────────────────────────┘
```

---

## ✨ Key Features

1. **Integrated Web Dashboard**: Clean, responsive UI served on Port `3000` to enter business details (Name, Address, City, Pincode, Phone, Website) and get live audit reports with field-level diffing.
2. **Zero External SaaS Dependencies**: Runs bundled Playwright Chromium inside the worker container using `mcr.microsoft.com/playwright:v1.42.0-jammy`.
3. **Smart Indian Address & Phone Normalization**: Strips `+91`, handles STD prefixes, and standardizes local area aliases (`Bengaluru`/`Bangalore`, `HSR`, `Koramangala`, `Rd`/`Road`).
4. **Field-Level Diffing**: Generates exact match confidence scores (`CONSISTENT`, `DRIFT`, `INCONSISTENT`, `NOT_FOUND`).
5. **Supabase Integration (Optional)**: Can run as an async queue worker for background processing.

### Reliable Google Business Profile discovery

Google Maps' rendered HTML is not a stable integration surface: a precise query
may open one place directly instead of a card list, and Google may show consent
or challenge pages to an automated browser. Discovery now handles direct place
pages, result cards, consent prompts, and normal Google web results, and returns
an actionable diagnostic rather than silently claiming no business exists.

For production, configure `GOOGLE_MAPS_API_KEY` and enable **Places API (New)**
in Google Cloud. The service will use the official Text Search endpoint first
and only use the browser fallbacks if it is unavailable or produces no match.
Restrict the server-side key to the Places API and to your server IP; do not put
it in frontend JavaScript. The Places API is the supported alternative to
scraping Maps, which Google's Maps terms prohibit. See [Places Text Search](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchText) and [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies).

Without a Google key, the confirmation search combines these sources:

1. **OpenStreetMap / Nominatim** — free, no-key name/address lookup; it is cached and rate-limited to one request per second as required by its [usage policy](https://operations.osmfoundation.org/policies/nominatim/).
2. **OpenStreetMap / Overpass** — a small exact-name, city-bounded POI lookup when Nominatim has no result; public instances are community services and may reject overloaded queries.
3. **Google Maps rendered page** — direct-place page and result-card fallback only; coverage is strong, but this is not a guaranteed integration surface.
4. **Google web results** — finds the business website and public directory profiles, which the user can inspect and confirm.

The screen shows one ranked list from the available sources, with duplicate URLs removed. OpenStreetMap coverage is community-maintained, so absence there does not mean that a business does not exist.

---

## 🔒 Access Control

Every route (the dashboard and all `/api/*` endpoints) is gated behind a login
page once `INTERNAL_APP_PASSWORD` is set — set it on every deployed instance.
Approved corrections queue real writes to a client's live Google Business
Profile, so this should never be left open on a public URL. Also set
`SESSION_SECRET` to a stable value (`openssl rand -hex 32`); without it a
random secret is generated per process and every restart signs everyone out.
Both are optional for local development only.

Client-facing audit reports at `/report/:id` are the one deliberate exception
— they're meant to be shared with the client, so access control there is the
unguessable report id, not the operator login. Use "🔗 Copy Client Report
Link" on a completed audit to get a shareable, print/PDF-friendly report page.

---

## 🚀 Deployment (Railway / Render / Fly.io / VPS / Docker)

### Option A: 1-Click Container Deployment (Web Dashboard + Scraper)
Deploy directly using the provided `Dockerfile` to Railway, Render, Fly.io, or any VPS.

1. Connect your git repository to **Railway** or **Render**.
2. Railway/Render will automatically pick up the `Dockerfile` and build it with pre-bundled Chromium binaries.
3. Once deployed, open your generated domain (e.g. `https://citation-audit-agent.up.railway.app`) to access the web form and run audits anytime!

### Option B: Local Web Server Testing
```bash
# 1. Install dependencies
npm ci

# 2. Install Playwright Chromium binaries
npx playwright install chromium

# 3. Compile and start the Web Dashboard
npm run build
npm start
# Open http://localhost:3000 in your browser
```

### Option C: Async Supabase Worker Mode
To run in background polling mode for Supabase queue jobs:
```bash
npm run worker
```
Run both `supabase/writeback.sql` and `supabase/audit_queue.sql` against your
Supabase project first — the worker polls `audit_jobs`/`audit_results`
(queue mode) and `write_jobs` (GBP writeback), and both tables must exist.

---

## 📡 REST API Endpoint

### `POST /api/audit`
Triggers an automated NAP audit programmatically.

**Request Body:**
```json
{
  "businessName": "Nissa Dental Clinic & Implant Center",
  "address": "No. 45, 100 Feet Road, 4th Block, Koramangala",
  "city": "Bengaluru",
  "pincode": "560034",
  "phone": "08098765432",
  "category": "Dental Clinic",
  "website": "https://nissadental.com"
}
```

**Response:**
Returns complete `NAPAuditReport` object with directory scores, field diffs, and generated Markdown report.
