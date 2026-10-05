-- The committee's event plan: what replaces the "Volsoc Master Plan" sheet.
--
-- Two kinds of event share one table. `volsoc` rows are the committee's own
-- and fully editable. `social_impact` rows come from the UCL Student Social
-- Impact organiser feed on Adam's Campus Toolbox, matched on the iCal UID; the
-- feed owns their title, time and place, and the committee owns everything
-- else on them (category, status, lead, links, notes). A feed row that drops
-- out of the feed is marked `removed_at`, never deleted, so what the committee
-- wrote against it survives.
--
-- Times are UTC instants; the app shows and computes them in Europe/London.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('volsoc', 'social_impact')),
  category text not null check (category in ('social', 'volunteering', 'ucl_affiliated', 'external')),
  toolbox_uid text,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  description text,
  url text,
  status text not null default 'provisional' check (status in ('provisional', 'confirmed', 'cancelled')),
  lead_member_id uuid references public.members(id) on delete set null,
  -- A VolSoc event run alongside a Social Impact one (the sheet's
  -- "Union Event" / "Volsoc Event" pair).
  linked_event_id uuid references public.events(id) on delete set null,
  plan_doc_url text,
  instagram_url text,
  recap_url text,
  notes text,
  target_volunteers integer check (target_volunteers is null or target_volunteers >= 0),
  actual_attendance integer check (actual_attendance is null or actual_attendance >= 0),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint events_ends_after_starts check (ends_at >= starts_at),
  constraint events_not_linked_to_self check (linked_event_id is null or linked_event_id <> id),
  -- The committee's rows never carry a feed UID. (A Social Impact row may lack
  -- one: history imported from the sheet predates the feed.)
  constraint events_uid_only_on_feed_rows check (source = 'social_impact' or toolbox_uid is null)
);

-- A plain (not partial) unique constraint so `upsert ... on conflict
-- (toolbox_uid)` can target it; nulls never collide, so volsoc rows are free.
create unique index events_toolbox_uid_idx on public.events (toolbox_uid);
create index events_starts_at_idx on public.events (starts_at);
create index events_live_starts_at_idx on public.events (starts_at) where removed_at is null;
create index events_lead_idx on public.events (lead_member_id) where lead_member_id is not null;
create index events_linked_idx on public.events (linked_event_id) where linked_event_id is not null;

create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();

-- Going / maybe / no per committee member. No row = hasn't answered.
create table public.event_responses (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  response text not null check (response in ('going', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create index event_responses_member_idx on public.event_responses (member_id);

create trigger event_responses_set_updated_at before update on public.event_responses
for each row execute function public.set_updated_at();

-- Weekly recurring unavailability (the sheet's Availability tab). Minutes
-- after midnight in Europe/London wall time, so 09:00 stays 09:00 across the
-- clock change. ISO weekday, Monday = 1.
create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440),
  note text,
  created_at timestamptz not null default now(),
  constraint availability_blocks_end_after_start check (end_minute > start_minute)
);

create index availability_blocks_member_idx on public.availability_blocks (member_id, weekday);

-- One row per sync attempt, for the "last synced" line and for debugging.
create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  summary jsonb not null default '{}'::jsonb,
  error text
);

create index sync_runs_kind_started_idx on public.sync_runs (kind, started_at desc);

alter table public.events enable row level security;
alter table public.event_responses enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.sync_runs enable row level security;

revoke all on public.events from anon, authenticated;
revoke all on public.event_responses from anon, authenticated;
revoke all on public.availability_blocks from anon, authenticated;
revoke all on public.sync_runs from anon, authenticated;
