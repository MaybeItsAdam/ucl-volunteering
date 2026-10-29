-- Zero Food Waste collection alerts: CH&Co staff say "there's food to collect",
-- and volunteers who opted in on the phone app get a push notification.
--
-- partner_staff: CH&Co people who can post alerts. They have no UCL account, so
-- they sign in with a personal access code a principal makes on the Members
-- page. Only a hash of the code is kept; revoking a person sets revoked_at.
--
-- collection_alerts: one row per "food available" post. `status` goes
-- open -> collected (staff: all taken) or withdrawn (staff: posted by mistake);
-- an open alert past collect_by is treated as over without a row change.
--
-- push_devices: phones that tapped "Notify me" in the app. The token is the
-- APNs (ios) or FCM (android) registration; a token the push service reports
-- as dead is deleted on the next send.

create table public.partner_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  organisation text not null default 'CH&Co' check (char_length(btrim(organisation)) between 1 and 80),
  code_hash text not null unique,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create table public.collection_alerts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.partner_staff(id) on delete set null,
  outlet text not null check (char_length(btrim(outlet)) between 1 and 80),
  what text not null check (char_length(btrim(what)) between 1 and 200),
  note text check (note is null or char_length(note) <= 300),
  collect_by timestamptz not null,
  status text not null default 'open' check (status in ('open', 'collected', 'withdrawn')),
  notified integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index collection_alerts_open_idx on public.collection_alerts (collect_by desc) where status = 'open';
create index collection_alerts_staff_idx on public.collection_alerts (staff_id, created_at desc);

create trigger collection_alerts_set_updated_at before update on public.collection_alerts
for each row execute function public.set_updated_at();

create table public.push_devices (
  token text primary key check (char_length(token) between 20 and 4096),
  platform text not null check (platform in ('ios', 'android')),
  member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.partner_staff enable row level security;
alter table public.collection_alerts enable row level security;
alter table public.push_devices enable row level security;

revoke all on public.partner_staff from anon, authenticated;
revoke all on public.collection_alerts from anon, authenticated;
revoke all on public.push_devices from anon, authenticated;
