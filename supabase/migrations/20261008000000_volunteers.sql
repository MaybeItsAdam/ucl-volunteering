-- The volunteer register: students who signed up at /volunteer, with how often
-- they could help, when they're free and what they'd like to do. Signing up
-- takes a UCL sign-in, so every row is a real student; the committee reads the
-- register on the Volunteers tab.
--
-- One row per member: signing up again replaces the answers rather than
-- adding a second row. Name and email are copied from the member at each
-- sign-up, so the register reads the way the student signed it. Option keys (commitment, periods,
-- slots, interests) are defined in src/lib/volunteers.ts and checked there;
-- the arrays stay free text here so adding an option needs no migration.

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members(id) on delete cascade,
  email text not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  study text,
  commitment text not null,
  periods text[] not null default '{}',
  slots text[] not null default '{}',
  interests text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index volunteers_created_at_idx on public.volunteers (created_at desc);

create trigger volunteers_set_updated_at before update on public.volunteers
for each row execute function public.set_updated_at();

alter table public.volunteers enable row level security;

revoke all on public.volunteers from anon, authenticated;
