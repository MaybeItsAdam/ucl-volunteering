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
| `TOOLBOX_ORGANISER_ID` | no | VolSoc's own Toolbox organiser; its principals and committee get those roles here. Unset, seats are granted on the Members page |
| `CALENDAR_ORGANISER_ID` | no | Whose public iCal feed fills the plan; defaults to `org_uni_juev5rp0v` (UCL Student Social Impact) |
| `ADMIN_EMAILS` | no | Comma-separated; these people sign in as admin |
| `TOOLBOX_API_TOKEN` | no | Only if the Toolbox feed ever needs authenticating |

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

VolSoc plans around what UCL Student Social Impact runs: USSI's public iCal
feed (`CALENDAR_ORGANISER_ID`, default `org_uni_juev5rp0v`) is synced into the
plan daily at 06:30 UTC by Vercel Cron (`/api/sync/organiser-events`). USSI's
events are read-only context; VolSoc's own events sit alongside them.

## Scripts

| | |
| --- | --- |
| `npm run dev` | Dev server on Doppler `prd` |
| `npm run build` | Migrate (production only), then build |
| `npm run typecheck` / `lint` / `test` | `tsc`, ESLint, Vitest |
| `npm run env:check` | Check Doppler `prd` |
