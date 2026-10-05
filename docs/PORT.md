# Port to Next.js — shared contract

The Vite SPA was replaced (see git history before this port). The new app
is Next.js 16 + Supabase + Adam's Campus Toolbox sign-in, built on the skeleton
of `../ucl-hiking` with every walk-specific feature dropped. The app replaces the
"Volsoc Master Plan" Google Sheet (and `apps-script/`) as the source of truth
for the committee's event plan.

Reference app: `/Users/adam/Projects/Code For SUU/ucl-hiking`. Copy its idioms,
versions, comment style and lib structure. Read
`node_modules/next/dist/docs/` before using a Next API you're unsure of —
Next 16 differs from training data (e.g. `src/proxy.ts`, not middleware).

## Identity

- Society: UCL Volunteering Society ("VolSoc").
- Toolbox organiser for the calendar: **UCL Student Social Impact**,
  id `org_uni_juev5rp0v`. Public iCal feed:
  `https://www.adamscampustoolbox.org.uk/api/organiser/org_uni_juev5rp0v/ical`.
  Env var `CALENDAR_ORGANISER_ID` (defaults to that id). `TOOLBOX_ORGANISER_ID` is VolSoc's own organiser, used only for roles.
- Doppler: project `volsoc-webapp`, config `prd`. CLI wrapper `doppler-volsoc`
  if on PATH, else `doppler` (`scripts/doppler.sh`, as hiking).
- App URL placeholder: `https://uclvolunteering.org`.

## Access model (simpler than hiking — no membership tiers, no walk leaders)

`src/lib/access.ts`: governance role `committee | principal | admin | null`.
Signed-in people with no role see only Settings and a "you're not on the
committee" note. Capabilities:

| capability | who |
|---|---|
| `view_plan` (planner, availability, events) | any governance role |
| `edit_plan` (create/move/edit VolSoc events, set lead) | any governance role |
| `manage_members` (members page; grant/remove committee) | principal, admin |
| `trigger_sync` | any governance role |

Principal/admin come from Toolbox (as hiking); committee is granted in-app by a
principal and locked (`governance_role_locked`).

## Schema (Postgres via Supabase service role; browsers have no table grants)

Migrations in `supabase/migrations/`, applied by `scripts/deploy-migrate.mjs`
(copied from hiking) into `public.schema_migrations`.

`20261003000000_initial_schema.sql` — owned by the **foundation** agent:
- `members`: `id uuid pk default gen_random_uuid()`, `toolbox_user_id text unique not null`,
  `email text`, `name text not null`, `governance_role text check in (...) null`,
  `governance_role_locked boolean not null default false`,
  `colour text` (identity hue for availability overlay, one of
  `purple|pink|orange|azure|emerald|amber`, assigned round-robin on insert by app code),
  `created_at`, `updated_at`, `last_seen_at timestamptz`.
- Plus whatever session/audit tables hiking's auth genuinely needs (keep minimal).

`20261003010000_plan.sql` — owned by the **data** agent:
- `events`:
  - `id uuid pk`, `source text not null check in ('volsoc','social_impact')`,
  - `category text not null check in ('social','volunteering','ucl_affiliated','external')`
    (Social impact feed rows default `ucl_affiliated`; the committee may recategorise to `external`),
  - `toolbox_uid text unique` (iCal UID; null for volsoc rows),
  - `title text not null`, `starts_at timestamptz not null`, `ends_at timestamptz not null`,
    `all_day boolean not null default false`, `location text`, `description text`, `url text`,
  - `status text not null default 'provisional' check in ('provisional','confirmed','cancelled')`,
  - `lead_member_id uuid references members on delete set null`,
  - `linked_event_id uuid references events on delete set null` (a VolSoc event run
    alongside a Social Impact one — the sheet's "Union Event"/"Volsoc Event" pair),
  - `plan_doc_url text`, `instagram_url text`, `recap_url text`, `notes text`,
  - `target_volunteers int`, `actual_attendance int`,
  - `created_by uuid references members`, `created_at`, `updated_at`,
  - `removed_at timestamptz` (set when a feed event disappears; never hard-delete feed rows).
  - Social Impact rows are read-only in time/title/location (feed owns them); VolSoc rows are fully editable and draggable.
- `event_responses`: `event_id uuid references events on delete cascade`,
  `member_id uuid references members on delete cascade`,
  `response text not null check in ('going','maybe','no')`, `updated_at`,
  `primary key (event_id, member_id)`. No row = hasn't answered.
- `availability_blocks` (weekly recurring *unavailability*, replaces the Availability tab):
  `id uuid pk`, `member_id uuid references members on delete cascade`,
  `weekday smallint check between 1 and 7` (ISO, Mon=1),
  `start_minute smallint`, `end_minute smallint` (minutes after midnight, Europe/London,
  end > start), `note text`, `created_at`.
- `sync_runs`: `id uuid pk`, `kind text`, `started_at`, `finished_at`, `ok boolean`,
  `summary jsonb`, `error text`.

Times: store UTC `timestamptz`; display and compute in `Europe/London`.

## Shared TypeScript types — `src/lib/types.ts` (foundation creates with `Member`; data agent appends plan types)

```ts
export type EventSource = "volsoc" | "social_impact";
export type EventCategory = "social" | "volunteering" | "ucl_affiliated" | "external";
export type EventStatus = "provisional" | "confirmed" | "cancelled";
export type ResponseKind = "going" | "maybe" | "no";
export interface PlanEvent { id; source; category; title; startsAt: string; endsAt: string; allDay; location; description; url; status; leadMemberId; linkedEventId; planDocUrl; instagramUrl; recapUrl; notes; targetVolunteers; actualAttendance; removedAt; responses: { memberId: string; response: ResponseKind }[] }
export interface AvailabilityBlock { id; memberId; weekday: number; startMinute: number; endMinute: number; note: string | null }
```

## HTTP API (owned by the data agent; JSON; session cookie; capability-checked)

- `GET  /api/plan/events?from=ISO&to=ISO` → `{ events: PlanEvent[] }` (excludes removed unless `?removed=1`)
- `POST /api/plan/events` (edit_plan) create VolSoc event → `{ event }`
- `PATCH /api/plan/events/[id]` (edit_plan) partial update; for `social_impact` rows only
  `category, status, lead_member_id, linked_event_id, plan_doc_url, instagram_url, recap_url, notes, target_volunteers, actual_attendance` may change → `{ event }`
- `DELETE /api/plan/events/[id]` (edit_plan) VolSoc rows only.
- `PUT  /api/plan/events/[id]/response` body `{ response: ResponseKind | null }` (own response) → `{ ok }`
- `GET  /api/plan/availability` → `{ blocks: AvailabilityBlock[], members: {id,name,colour}[] }`
- `PUT  /api/plan/availability` body `{ blocks: Omit<AvailabilityBlock,'id'|'memberId'>[] }` replaces the caller's own blocks.
- `GET  /api/sync/organiser-events` (cron, `CRON_SECRET` bearer as hiking) and
  `POST` same path from a committee session → runs the Toolbox organiser sync, writes `sync_runs`.
- Data access goes through `src/lib/plan.ts` (server-only) so pages can call it directly in Server Components.

## Portal structure (foundation creates shell; wave-2 agents fill pages)

- `/` — public landing page (ported flag site, `src/components/landing/`).
- `/auth/signin`, `/auth/callback` — Toolbox handoff (as hiking).
- `/portal` → redirects to `/portal/plan`.
- `/portal/plan` — **week planner** (screenshot): 7-day grid, 08:00–22:00, 1 hr = 60px,
  drag VolSoc events to reschedule (15-min snap, optimistic PATCH), Social Impact
  events not draggable, now-line, day counts, week nav, categories legend,
  availability overlay toggles per member. Mobile: single-day view with swipe.
- `/portal/plan/events/[id]` — event detail: all fields, lead picker, going/maybe/no for
  each committee member, links (plan doc, Instagram, recap), linked event.
- `/portal/plan/list` — agenda list grouped by week/term (replaces the sheet's rows).
- `/portal/availability` — edit own weekly unavailability (Mon–Fri 08:00–20:00, 30-min cells,
  drag-paint) and see everyone's combined.
- `/portal/members` — members admin (principal/admin): grant/remove committee, lock/unlock.
- `/account` — settings (theme, sign out).

## Design

VolSoc's own brand, everywhere. Strong cyan `#10c4c0` is the signature colour,
prussian blue `#061c33` replaces black and linen `#feefe5` replaces white (dark mode
swaps them). Tomato `#f26640` marks problems and lime moss `#8fb339` good news.
League Spartan for headlines and titles, Work Sans (medium) for the rest. Cyan is
too light for text on linen, so it fills buttons and marks with prussian on top.
Layout stays flat: hairline borders, no shadows, 8px/6px radii, micro-labels.
Tokens live in `src/app/globals.css`; components only use the role tokens.

Copy: no full stops, capital V for Volunteering, clear, direct and kind.

Category colours, the brand's project colours: `social` → Socials, baby pink
`#ff99c8`; `volunteering` → Student led, lavender `#9b5de5`; `ucl_affiliated` →
Group led, golden pollen `#ffd23f`; `external` → External, brick red `#ad2e24`.
Render as tinted fill (`/10`) + `/40` border + 3px left rule of the hue, not solid
blocks. Member identity hues come from the brand colours too.

## Ownership (do not edit another agent's files; report needed changes instead)

- foundation: root config (`package.json`, lockfile, `tsconfig.json`, `next.config.ts`,
  `eslint.config.mjs`, `vitest.config.ts`, `vercel.json`, `doppler.yaml`, `.gitignore`),
  `scripts/`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/auth/**`,
  `src/app/api/auth/**`, `src/app/(app)/layout.tsx`, `src/app/(app)/portal/page.tsx`,
  `src/app/(app)/account/**`, `src/proxy.ts`, `src/components/App*.tsx` + shared UI
  (`Sheet`, `PageSkeleton`, `ThemeSetting`, `SignInButton`, `AccountButton`),
  `src/lib/{access,app-pages,session,supabase,authCallback,cronAuth,theme,audit}.ts`,
  `src/lib/types.ts` (Member section), initial migration, README.
- landing: `src/components/landing/**`, `src/app/page.tsx`, `public/` additions.
- data: `supabase/migrations/20261003010000_plan.sql`, `src/lib/{plan,planTime,toolboxEvents,ical}.ts`
  (+ tests), `src/lib/types.ts` (plan section, appended), `src/app/api/plan/**`,
  `src/app/api/sync/**`, `scripts/import-master-plan.mjs`.
- wave 2: planner (`src/app/(app)/portal/plan/**`, `src/components/plan/**`),
  availability (`src/app/(app)/portal/availability/**`, `src/components/availability/**`),
  members (`src/app/(app)/portal/members/**`, `src/components/members/**`, `src/app/api/members/**`).
