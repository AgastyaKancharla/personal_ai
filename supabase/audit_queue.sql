-- Async audit queue tables, polled by src/worker.ts (Option C: Async Supabase Worker Mode).
-- A separate system (e.g. a CRM) inserts rows into audit_jobs with status='PENDING';
-- the worker claims them, runs the audit, and writes results to audit_results.
create table if not exists audit_jobs (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  address text,
  city text,
  pincode text,
  phone text,
  category text,
  website text,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','COMPLETED','FAILED')),
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists audit_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references audit_jobs(id),
  business_name text not null,
  score integer,
  report_json jsonb not null,
  completed_at timestamptz not null default now()
);

create index if not exists audit_jobs_status_idx on audit_jobs (status);
