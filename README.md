# UCL Volunteering Society

The VolSoc public site and the committee's planning portal: a Next.js 16 app
backed by a dedicated Supabase project. It replaces the "Volsoc Master Plan"
Google Sheet as the source of truth for the committee's event plan.

UCL identity comes from Adam's Campus Toolbox (UCL Entra behind it). The app
swaps the Toolbox's short-lived handoff for its own `HttpOnly` cookie
(`volsoc_session`) and resolves access from its own `members` table on every
request; the cookie never authorises anything by itself.


## Local setup

Secrets live in Doppler: project `volsoc-webapp`, config `prd`.

```bash
doppler login                    # or doppler-volsoc login, see below
npm install
npm run dev                      # next dev on volsoc-webapp/prd
```

If your own Doppler login is for another workplace, keep VolSoc's apart with a
wrapper on your PATH called `doppler-volsoc`
(`exec doppler --config-dir "$HOME/.doppler-volsoc" "$@"`), then
`doppler-volsoc login` once. `scripts/doppler.sh` uses it when it's there,
plain `doppler` otherwise.

`npm run dev:no-doppler` runs without any secrets: with no Supabase configured,
the portal runs off the session alone, and the sign-in page offers a dev
sign-in as committee, principal, admin or nobody (`/api/auth/dev-login?role=`).
Never available in production.

Local dev runs on `prd`: it reads the production database either way.

## Environment

Change secrets in Doppler, never in Vercel directly (the next sync overwrites
them). `npm run env:check` checks `prd` has them all, in the right shape,
without printing any value.

| Variable | Required | What |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only; the only key that can reach the tables |
| `MIGRATE_DATABASE_URL` | yes | Postgres URL (session pooler, port 5432) for `deploy-migrate` |
| `NEXT_PUBLIC_APP_URL` | yes | `https://uclvolunteering.org` |
| `SESSION_SECRET` | yes | ≥ 32 chars: `openssl rand -base64 48` |
| `CRON_SECRET` | yes | Bearer for Vercel Cron: `openssl rand -hex 32` |
| `TOOLBOX_URL` | yes | `https://www.adamscampustoolbox.org.uk` |
| `TOOLBOX_ORGANISER_ID` | no | VolSoc's own Toolbox organiser; its principals and committee get those roles here. Unset, seats are granted on the Members page. Its feed is synced either way (default `org_soc_vol_fix`) |
| `CALENDAR_ORGANISER_ID` | no | Whose public iCal feed fills the plan; defaults to `org_uni_juev5rp0v` (UCL Student Social Impact) |
| `CALENDAR_FEED_TOKEN` | no | Key in the committee's private iCal feed of VolSoc's events (`/api/calendar/volsoc/<token>`, under Subscribe on the calendar): `openssl rand -hex 24`. Change it to cut off every old link |
| `ADMIN_EMAILS` | no | Comma-separated; these people sign in as admin |
| `TOOLBOX_API_TOKEN` | no | Only if the Toolbox feed ever needs authenticating |
| `TIMETABLE_FEED_KEY` | no | Encrypts saved UCL timetable links: `openssl rand -base64 32`. Unset, nobody can link one. Never rotate it casually: every saved link becomes unreadable and has to be pasted again |
| `ZFW_SHEET_WEBHOOK_URL` | no | The `/exec` URL of `apps-script/zero-food-waste`, which appends `/zero-food-waste` logs to the team's sheet. Unset, the form says it isn't connected |
| `ZFW_SHEET_SECRET` | no | Shared with that script's `ZFW_SECRET` property: `openssl rand -hex 32` |

If Vercel's Supabase integration is installed it owns the `SUPABASE_*` and
`POSTGRES_*` names; keep those out of Doppler.

## Migrations

SQL lives in `supabase/migrations/`. `npm run build` runs
`scripts/deploy-migrate.mjs` before `next build`: on a Vercel **production**
build it applies every file not yet recorded in `public.schema_migrations`,
each in one transaction with its ledger row. A failure fails the build and the
previous deployment keeps serving. Preview and local builds skip it; run it by
hand with

```bash
MIGRATE_DATABASE_URL=postgres://... npm run db:migrate
```

Add a new migration as a new file; never edit an applied one (edits are
warned about, not re-run). Every table has RLS on and no grants for `anon` or
`authenticated`: all reads and writes go through server code using the
service role after the session check.

## Access

| Role | Where it comes from | Can |
| --- | --- | --- |
| none | Anyone with a UCL account who signs in | Settings, and a note to ask a principal |
| committee | Granted in-app by a principal (locked so sign-in won't undo it), or the Toolbox | Plan, availability, edit events, run a sync |
| principal | The Toolbox organiser's principals | All of the above, plus the Members page |
| admin | Toolbox global admins, or `ADMIN_EMAILS` | Same as principal |

Capabilities live in `src/lib/access.ts`; the tabs in `src/lib/app-pages.ts`.

## Toolbox

Register the site's origin (`https://uclvolunteering.org`, plus
`http://localhost:3000` for dev) as an external site under the **UCL
Volunteering Society** organiser in the Toolbox Dev Portal, so the sign-in
handoff is allowed to return here. That organiser's principals and committee
get those roles here when `TOOLBOX_ORGANISER_ID` is set to its id.

Two public iCal feeds are synced into the plan daily at 06:30 UTC by Vercel
Cron (`/api/sync/organiser-events`), or from the plan page's sync button:

- UCL Student Social Impact (`CALENDAR_ORGANISER_ID`, default
  `org_uni_juev5rp0v`), as `social_impact` rows;
- VolSoc's own Toolbox page (`TOOLBOX_ORGANISER_ID`, default
  `org_soc_vol_fix`), as `volsoc_toolbox` rows, past events included.

The feed owns those rows' title, time and place; the committee owns the rest.
Events typed into the app are `volsoc` rows and fully editable.

## Public pages

- `/calendar`: What's on, open to anyone: upcoming events from the Toolbox
  societies tagged `altruism` (Street Aid, Red Cross, Student Action for
  Refugees, …) plus VolSoc and UCL Student Social Impact, synced daily into
  `community_events` (`src/lib/communityEvents.ts`). One combined feed to
  subscribe to at `/calendar.ics`.
- `/volunteer`: the volunteer register. Needs a UCL sign-in (any role, or
  none), which lands back on the form; signing up again updates your answers,
  and you can take yourself off. The committee reads it on the portal's
  Volunteers tab (filter, CSV, copy emails).
- `/zero-food-waste`: no sign-in. Shift leaders log what they collected; each
  log is a new row in the Zero Food Waste sheet via
  `apps-script/zero-food-waste`.

## Scripts

| | |
| --- | --- |
| `npm run dev` | Dev server on Doppler `prd` |
| `npm run build` | Migrate (production only), then build |
| `npm run typecheck` / `lint` / `test` | `tsc`, ESLint, Vitest |
| `npm run env:check` | Check Doppler `prd` |
