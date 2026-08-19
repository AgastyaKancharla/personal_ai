-- Single-table state store for the personal AI tracker.
-- One row ('main') holds the entire { clients, tasks } state as jsonb.
-- Access is gated at the app layer (password + signed session cookie) and
-- this table is only ever touched server-side with the service role key,
-- so no public RLS policy is needed.

create table if not exists tracker_state (
  id text primary key,
  data jsonb not null default '{"clients":[],"tasks":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into tracker_state (id, data)
values ('main', '{"clients":[],"tasks":[]}'::jsonb)
on conflict (id) do nothing;

alter table tracker_state enable row level security;
-- No policies are created: with RLS on and zero policies, PostgREST access
-- via the anon/publishable key is fully denied. Only the service role key
-- (used exclusively in server-side API routes) can read or write this row.
