-- The volunteering directory (/opportunities): places students can volunteer,
-- curated by the committee, with the practical details the big listing sites
-- bury — how to sign up, drop-in times, DBS, age — on every card.
--
-- Option keys (causes, commitment, signup_method, dbs) are defined and checked
-- in src/lib/directory.ts; they stay free text here so adding an option needs
-- no migration. `sessions` is a list of { weekday, start, end, where, note }.
-- `verified_on` is the last day someone on the committee checked the entry
-- was still right; the public page flags entries not checked for six months.

create table public.directory_entries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,90}$'),
  organisation text not null check (char_length(btrim(organisation)) between 1 and 120),
  org_url text check (org_url is null or org_url ~ '^https?://'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  summary text not null check (char_length(summary) <= 200),
  description text check (description is null or char_length(description) <= 4000),
  causes text[] not null default '{}',
  commitment text not null,
  time_needed text,
  signup_method text not null,
  signup_url text check (signup_url is null or signup_url ~ '^https?://'),
  signup_email text,
  signup_steps text,
  sessions jsonb not null default '[]'::jsonb check (jsonb_typeof(sessions) = 'array'),
  address text,
  postcode text,
  nearest_station text,
  remote boolean not null default false,
  min_age smallint check (min_age is null or min_age between 0 and 99),
  dbs text not null default 'not_needed',
  expenses_paid boolean not null default false,
  training text,
  accessibility text,
  contact_name text,
  contact_email text,
  verified_on date,
  active boolean not null default true,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index directory_entries_active_idx on public.directory_entries (organisation, title) where active;

create trigger directory_entries_set_updated_at before update on public.directory_entries
for each row execute function public.set_updated_at();

alter table public.directory_entries enable row level security;

revoke all on public.directory_entries from anon, authenticated;
