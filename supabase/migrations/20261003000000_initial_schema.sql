-- VolSoc committee portal: who can sign in, and what they did.
--
-- Identity is Adam's Campus Toolbox (UCL Entra behind it), not Supabase Auth,
-- so no Supabase JWT is ever minted for a person. The browser gets no table
-- grants: every read and write goes through a server route that has checked the
-- HttpOnly `volsoc_session` cookie and then uses the service role.

create extension if not exists pgcrypto;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  toolbox_user_id text not null unique,
  email text,
  name text not null,
  -- principal/admin come from the Toolbox society governance roles on each
  -- sign-in; committee is granted in-app by a principal and then locked so a
  -- sign-in never overwrites it. Null = signed in but not on the committee.
  governance_role text check (governance_role in ('committee', 'principal', 'admin')),
  governance_role_locked boolean not null default false,
  -- Identity hue for the availability overlay; assigned round-robin by the app.
  colour text check (colour in ('purple', 'pink', 'orange', 'azure', 'emerald', 'amber')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index members_email_idx on public.members (lower(email));
create index members_role_idx on public.members (governance_role) where governance_role is not null;

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_member_id uuid references public.members(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);

alter table public.members enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.members from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;

-- Shared by every table with an `updated_at`; later migrations reuse it.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger members_set_updated_at before update on public.members
for each row execute function public.set_updated_at();
