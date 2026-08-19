# Persona Brain — Build Specification

Goal: the founder types a plain sentence into the tracker and it files itself correctly,
without paying per call to anyone.

Build in the order below. Each phase ships something usable on its own. Do not start a
phase before the previous one meets its acceptance criteria.

---

## Phase 0 — Secure and normalise what's live

The tracker is already deployed and holding real business data behind nothing.

**0.1 Authentication**
- Add Supabase Auth (email + password is sufficient; single user).
- Gate the whole app behind a session check.
- Rewrite RLS on all tables to `auth.uid() = user_id`.
- Rotate the publishable key after the fixed-row-id policy is dropped.

**0.2 Schema migration**

Current state is one JSONB blob. Move to real tables — the training pipeline needs to
query entities, and a blob makes that impossible.

```sql
clients      (id, user_id, name, phone, stage, quote_value, advance,
              next_follow_up, notes, created_at, history jsonb)
deliverables (id, client_id, text, done, source, created_at)
tasks        (id, user_id, title, client_id, due_date, done, created_at)
parse_log    (id, user_id, raw_text, engine, output jsonb, confidence,
              accepted, corrected_output jsonb, created_at)
```

`history` stays JSONB — it's a stage→date map, genuinely schemaless.
`source` on deliverables records whether it came from a catalogue template, a pasted
quote, or manual entry. Useful signal later.

Write a one-time migration that reads the existing blob and populates these tables.
**Verify row counts against the blob before dropping anything.**

**Acceptance:** app works exactly as before, behind a login, on normalised tables, with
zero data lost.

---

## Phase 1 — Rules engine

A pure TypeScript package. No network, no dependencies, no AI. This is what runs 90% of
the time and it must be dependable.

### The action schema (shared contract — version it)

```ts
type Stage = 'cold'|'interested'|'meeting'|'finalised'|'quoted'|'advance'|'building'|'delivered';

type Action =
  | { type:'task';        title:string; clientName:string|null; date:string }
  | { type:'client';      name:string; phone:string|null }
  | { type:'stage';       clientName:string; stage:Stage }
  | { type:'money';       clientName:string; quoteValue:number|null; advance:number|null }
  | { type:'service';     clientName:string; service:string }
  | { type:'deliverable'; clientName:string; items:string[] }
  | { type:'done';        clientName:string; match:string }
  | { type:'tick';        match:string }
  | { type:'followup';    clientName:string; date:string };

interface ParseResult {
  actions: Action[];
  confidence: number;   // 0–1
  engine: 'rules'|'model'|'api';
  summary: string;
}
```

### What the rules must handle

| Pattern | Example | Emits |
|---|---|---|
| Money | `paid 25k advance`, `1.5L quote`, `₹80,000` | `money` |
| Relative dates | `Friday`, `tomorrow`, `next week`, `25th` | date on `task`/`followup` |
| Stage verbs | `called`, `met`, `interested`, `quote sent`, `delivered` | `stage` |
| Solution names | any of the 14 catalogue names, fuzzy | `service` |
| Client resolution | fuzzy match against existing client names | `clientName` |
| Completion | `logo done for X`, `finished the website` | `done` / `tick` |

**Confidence scoring:** start at 0. Add for each confidently matched element (client
resolved, date parsed, amount found, verb recognised). Subtract for unconsumed text.
Emit the numeric score — the fallback decision depends on it being honest, so do not
inflate it.

Below threshold (start at 0.6) → escalate to Engine 2/3.

**Acceptance:** ≥70% exact-match on a hand-written set of 100 realistic entries. Every
supported pattern has a unit test. The test file is the specification.

---

## Phase 2 — Capture the training data

Nothing downstream is possible without this, and it costs almost nothing to build. Do it
early, even though its payoff is months away.

- Every parse writes a `parse_log` row: raw text, engine used, output, confidence.
- After the actions are applied, the UI shows what it did and lets the user **correct it**.
  Corrections write `corrected_output` and set `accepted = false`.
- Silent acceptance (user does nothing) sets `accepted = true` after a short delay.

**Corrections are the gold labels.** An uncorrected parse is weak evidence; a corrected one
is a labelled example of exactly where the system is wrong. Design the correction UI to be
one tap, or it won't get used and the dataset will be worthless.

Export script: `parse_log` → JSONL, held-out 20% split by date, not randomly.

```jsonl
{"input":"Bright Smile paid 25k advance","output":{"actions":[{"type":"money","clientName":"Bright Smile","quoteValue":null,"advance":25000}]}}
```

**Acceptance:** every entry produces a log row; corrections are captured; export produces
valid JSONL with a clean train/eval split.

---

## Phase 3 — Interim engine (removable)

So the product is useful before Phase 4 exists.

- Server route only — `/api/parse`. Never called from the browser directly.
- Provider behind an interface: swapping providers must touch one file.
- Off by default; enabled by presence of an env key.
- Log its outputs to `parse_log` like any other engine — these become training data too.

**Acceptance:** works when the key is set, degrades to rules-only when absent, and deleting
the provider file breaks nothing but itself.

---

## Phase 4 — Train the model

Trigger: **~500 logged entries with at least 100 corrections.** Do not start earlier;
fine-tuning on thin data produces a model that is confidently wrong.

- Base: Apache-2.0 small instruct model. Evaluate 1B–4B; pick the smallest that clears the
  accuracy bar, because inference cost and cold-start time scale with size.
- Method: LoRA / QLoRA via PEFT. Full fine-tuning is unnecessary and wasteful here.
- Train on Kaggle (~30 free GPU-hrs/week) or Colab free T4. A LoRA run on a few hundred
  examples takes well under an hour.
- **Notebook disks reset between sessions** — push adapters to HF Hub as the final cell of
  every run, not manually afterwards.
- Quantise to GGUF for CPU serving.

**Evaluation — do not skip.** Report field-level accuracy per action type, not one blended
number. A model that nails `task` and fails `money` is worse than the average suggests,
because money errors are the expensive kind.

**Acceptance:** ≥90% field-level accuracy on held-out data, and beats the rules engine on
the subset where rules scored below threshold. If it doesn't beat rules, it is not worth
hosting — say so plainly rather than shipping it.

---

## Phase 5 — Self-host

- FastAPI + llama-cpp-python, Docker Space on Hugging Face.
- Free CPU Basic: 16 GB RAM, 2 cores, 50 GB non-persistent disk. Sleeps after 48h idle;
  cold start 30–90s. Port 7860 is fixed.
- Weights pulled from HF Hub at boot and cached — do not bake them into the image.
- Same `/parse` contract as every other engine, so the app's calling code is unchanged.
- Verify whether a paid HF plan is required for compute Spaces on this account before
  designing around the free tier.

Once accuracy holds in production, remove Phase 3 entirely and the per-call cost goes to
zero permanently.

**Acceptance:** app runs end-to-end with no external inference provider configured.

---

## Environment

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY        # server only, never bundled
PARSER_URL                       # HF Space endpoint
HF_TOKEN                         # server only
INFERENCE_API_KEY                # optional, Phase 3 only, delete at Phase 5
```

## Where the effort actually pays

Phases 0–2 are worth doing regardless of whether the model ever gets trained: the app
becomes secure, queryable, and self-documenting. Phases 4–5 only pay off if entry volume is
real. If after three months the logs hold 60 entries rather than 600, the honest conclusion
is that the rules engine was sufficient and the model was never needed. Build Phase 2 so
that conclusion is visible in the data rather than argued about.
