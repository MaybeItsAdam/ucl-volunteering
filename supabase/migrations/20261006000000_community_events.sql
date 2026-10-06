-- What's on: upcoming events from the SU's social impact societies, for
-- everyone who signs in, committee or not.
--
-- The societies are the Toolbox societies the SU tags `altruism`, plus VolSoc
-- itself. A daily sync pulls each one's public iCal feed into
-- `community_events`, keeping a window from yesterday to two months ahead.
-- The feed owns every column, so a sync replaces a society's rows wholesale
-- (`replace_community_events`) rather than merging into them. A feed that
-- fails keeps its old rows and records `last_error`.
--
-- A society that drops out of the Toolbox list is marked `included = false`
-- rather than deleted, and the page leaves it out.

create table public.community_societies (
  organiser_id text primary key,
  name text not null,
  logo_url text,
  -- The society's own colours, from the Toolbox: data for a small swatch, not theme.
  colour text check (colour ~ '^#[0-9a-f]{6}$'),
  dark_colour text check (dark_colour ~ '^#[0-9a-f]{6}$'),
  union_url text,
  included boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger community_societies_set_updated_at before update on public.community_societies
for each row execute function public.set_updated_at();

create table public.community_events (
  id uuid primary key default gen_random_uuid(),
  organiser_id text not null references public.community_societies(organiser_id) on delete cascade,
  uid text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  url text,
  -- Clipped by the sync; the event page has the full text.
  description text,
  cancelled boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (organiser_id, uid),
  constraint community_events_ends_after_start check (ends_at >= starts_at)
);

create index community_events_starts_idx on public.community_events (starts_at);

alter table public.community_societies enable row level security;
alter table public.community_events enable row level security;

revoke all on public.community_societies from anon, authenticated;
revoke all on public.community_events from anon, authenticated;

-- One society's events, replaced in a single transaction so the page never
-- sees the gap between the delete and the insert. `events` is a JSON array of
-- rows as the sync built them. Returns how many rows were written.
create or replace function public.replace_community_events(p_organiser_id text, p_events jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  written integer;
begin
  delete from public.community_events where organiser_id = p_organiser_id;
  insert into public.community_events
    (organiser_id, uid, title, starts_at, ends_at, all_day, location, url, description, cancelled)
  select p_organiser_id, e.uid, e.title, e.starts_at, e.ends_at, coalesce(e.all_day, false),
         e.location, e.url, e.description, coalesce(e.cancelled, false)
  from jsonb_to_recordset(coalesce(p_events, '[]'::jsonb)) as e(
    uid text, title text, starts_at timestamptz, ends_at timestamptz, all_day boolean,
    location text, url text, description text, cancelled boolean
  );
  get diagnostics written = row_count;
  update public.community_societies
    set last_synced_at = now(), last_error = null
    where organiser_id = p_organiser_id;
  return written;
end;
$$;

revoke all on function public.replace_community_events(text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_community_events(text, jsonb) to service_role;
