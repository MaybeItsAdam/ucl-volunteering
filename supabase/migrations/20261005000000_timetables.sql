-- Committee members' UCL timetables, shown as busy time on the plan.
--
-- A member pastes their UCL timetable subscription link (Portico → Timetable
-- → Subscribe). That link is a bearer secret: anyone holding it reads the
-- timetable, so it is stored encrypted (AES-256-GCM under TIMETABLE_FEED_KEY,
-- see src/lib/timetableCrypto.ts) and never sent back to a browser.
--
-- `timetable_sessions` is a disposable cache of the feed, rewritten whole on
-- every changed fetch: timed, non-cancelled occurrences from 30 days back to
-- 300 days ahead. Titles and rooms are only ever shown to their owner; the
-- rest of the committee sees busy time.

create table public.timetable_subscriptions (
  member_id uuid primary key references public.members(id) on delete cascade,
  encrypted_url text not null,
  etag text,
  last_modified text,
  -- Hash of the last rows written, so an unchanged feed skips the rewrite.
  rows_hash text,
  last_fetched_at timestamptz,
  last_status text check (last_status in ('ok', 'error')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger timetable_subscriptions_set_updated_at before update on public.timetable_subscriptions
  for each row execute function public.set_updated_at();

create table public.timetable_sessions (
  member_id uuid not null references public.members(id) on delete cascade,
  -- The feed UID plus the occurrence start, hashed: stable across fetches.
  uid text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  title text not null,
  location text,
  primary key (member_id, uid),
  constraint timetable_sessions_ends_after_starts check (ends_at > starts_at)
);

create index timetable_sessions_starts_at_idx on public.timetable_sessions (starts_at);

alter table public.timetable_subscriptions enable row level security;
alter table public.timetable_sessions enable row level security;

revoke all on public.timetable_subscriptions from anon, authenticated;
revoke all on public.timetable_sessions from anon, authenticated;
