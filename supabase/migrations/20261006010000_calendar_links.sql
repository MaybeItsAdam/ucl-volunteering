-- Committee members' linked calendars, shown as busy time on the plan: the
-- UCL timetable (until now the only kind, in timetable_subscriptions) and
-- personal Google, Outlook / Microsoft 365 and Apple iCloud calendars.
--
-- Every link is a bearer secret (whoever holds it reads the calendar), so it
-- is stored encrypted, AES-256-GCM under TIMETABLE_FEED_KEY as before (see
-- src/lib/timetableCrypto.ts), and never sent back to a browser.
-- `url_hash` is an HMAC of the normalised link under a key derived from the
-- same secret, so the same calendar can't be linked twice; links carried over
-- below have none until their next refresh fills it in.
--
-- `calendar_link_blocks` is a disposable cache of each feed, rewritten whole
-- on every changed fetch: timed, busy, non-cancelled occurrences from 30 days
-- back to 300 days ahead. Personal calendars store only when, never what: the
-- check constraint keeps titles and rooms to UCL timetable rows, which only
-- their owner ever sees. The rest of the committee sees busy time.
--
-- A member may keep five links, at most one of them a UCL timetable.
--
-- timetable_subscriptions and timetable_sessions are copied across and left
-- in place, untouched, so the deployment still serving while this one builds
-- keeps working. A later migration drops them.

create table public.calendar_links (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  kind text not null check (kind in ('ucl_timetable', 'google', 'outlook', 'icloud')),
  -- The member's own name for it ("Work"). Only they see it.
  label text check (label is null or char_length(btrim(label)) between 1 and 40),
  encrypted_url text not null,
  url_hash text,
  etag text,
  last_modified text,
  -- Hash of the last rows written, so an unchanged feed skips the rewrite.
  rows_hash text,
  last_fetched_at timestamptz,
  last_status text check (last_status in ('ok', 'error')),
  last_error text,
  block_count integer not null default 0 check (block_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- For the blocks' composite foreign key, which carries the kind along.
  unique (id, kind)
);

-- Nulls are distinct, so carried-over links without a hash don't collide.
create unique index calendar_links_member_url_idx on public.calendar_links (member_id, kind, url_hash);
create unique index calendar_links_one_timetable_idx on public.calendar_links (member_id)
  where kind = 'ucl_timetable';
create index calendar_links_due_idx on public.calendar_links (last_fetched_at nulls first);

create trigger calendar_links_set_updated_at before update on public.calendar_links
  for each row execute function public.set_updated_at();

-- The cap, enforced here as well as in the app. Locking the member's row
-- makes two simultaneous adds take turns rather than both squeezing in.
create function public.calendar_links_enforce_cap() returns trigger
language plpgsql set search_path = public as $$
begin
  perform 1 from public.members where id = new.member_id for update;
  if (select count(*) from public.calendar_links where member_id = new.member_id) >= 5 then
    raise exception 'A member may link at most 5 calendars' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger calendar_links_cap before insert on public.calendar_links
  for each row execute function public.calendar_links_enforce_cap();

create table public.calendar_link_blocks (
  link_id uuid not null,
  kind text not null,
  member_id uuid not null references public.members(id) on delete cascade,
  -- The feed UID plus the occurrence start, hashed: stable across fetches.
  uid text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  title text,
  location text,
  primary key (link_id, uid),
  foreign key (link_id, kind) references public.calendar_links (id, kind) on delete cascade,
  constraint calendar_link_blocks_ends_after_starts check (ends_at > starts_at),
  constraint calendar_link_blocks_personal_has_no_details
    check (kind = 'ucl_timetable' or (title is null and location is null))
);

create index calendar_link_blocks_member_starts_idx on public.calendar_link_blocks (member_id, starts_at);

alter table public.calendar_links enable row level security;
alter table public.calendar_link_blocks enable row level security;

revoke all on public.calendar_links from anon, authenticated;
revoke all on public.calendar_link_blocks from anon, authenticated;
revoke all on function public.calendar_links_enforce_cap() from public, anon, authenticated;

-- Carry over every linked UCL timetable, with its sessions, sync state and
-- validators, so nobody has to paste their link again.
insert into public.calendar_links (
  member_id, kind, encrypted_url, etag, last_modified, rows_hash,
  last_fetched_at, last_status, last_error, block_count, created_at, updated_at
)
select
  s.member_id, 'ucl_timetable', s.encrypted_url, s.etag, s.last_modified, s.rows_hash,
  s.last_fetched_at, s.last_status, s.last_error,
  (select count(*) from public.timetable_sessions t where t.member_id = s.member_id),
  s.created_at, s.updated_at
from public.timetable_subscriptions s;

insert into public.calendar_link_blocks (link_id, kind, member_id, uid, starts_at, ends_at, title, location)
select l.id, 'ucl_timetable', t.member_id, t.uid, t.starts_at, t.ends_at, t.title, t.location
from public.timetable_sessions t
join public.calendar_links l on l.member_id = t.member_id and l.kind = 'ucl_timetable';
