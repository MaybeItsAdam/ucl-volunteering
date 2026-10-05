#!/usr/bin/env node
/**
 * Check a Doppler config has every secret the app needs, in a shape that works,
 * before a deploy finds out the hard way. Values are read in memory and never
 * printed.
 *
 *   npm run env:check            # production (local dev runs on it too)
 *   npm run env:check -- dev     # a dev config, if one is ever made
 */
import { execFileSync } from "node:child_process";

const config = process.argv[2] ?? "prd";

/** What each config must hold. */
const REQUIRED = {
  dev: ["SESSION_SECRET", "TOOLBOX_URL", "CRON_SECRET"],
  prd: [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    // Production builds apply migrations with it; without it the build fails. Not
    // POSTGRES_URL_NON_POOLING: Vercel's Supabase integration owns that name.
    "MIGRATE_DATABASE_URL",
    "NEXT_PUBLIC_APP_URL",
    "SESSION_SECRET",
    "CRON_SECRET",
    "TOOLBOX_URL",
  ],
};

/** Present in some configs, never required: noted so a typo'd name stands out. */
const OPTIONAL = ["ADMIN_EMAILS", "TOOLBOX_ORGANISER_ID", "CALENDAR_ORGANISER_ID", "TOOLBOX_API_TOKEN", "TIMETABLE_FEED_KEY", "VOLSOC_GOOGLE_CALENDAR_ID"];

/** Shape checks for the ones that break quietly when pasted wrong. */
const SHAPE = {
  MIGRATE_DATABASE_URL: (v) => /^postgres(ql)?:\/\/[^:]+:[^@]+@/.test(v) || "must be a postgres:// URL with the password in it",
  NEXT_PUBLIC_APP_URL: (v) => /^https:\/\//.test(v) || "must be the https:// production URL",
  NEXT_PUBLIC_SUPABASE_URL: (v) => /^https:\/\/.+\.supabase\.co\/?$/.test(v) || "must be https://<ref>.supabase.co",
  SESSION_SECRET: (v) => v.length >= 32 || "must be at least 32 characters (openssl rand -base64 48)",
  CRON_SECRET: (v) => v.length >= 16 || "must be at least 16 characters (openssl rand -hex 32)",
  TOOLBOX_URL: (v) => /^https?:\/\/[^/]+\/?$/.test(v) || "must be the Toolbox origin, e.g. https://www.adamscampustoolbox.org.uk",
  TOOLBOX_ORGANISER_ID: (v) => /^org_[a-z0-9_]+$/.test(v) || "must look like org_uni_juev5rp0v",
  CALENDAR_ORGANISER_ID: (v) => /^org_[a-z0-9_]+$/.test(v) || "must look like org_uni_juev5rp0v",
  VOLSOC_GOOGLE_CALENDAR_ID: (v) => /^[^\s@]+@[a-z0-9.-]+$/i.test(v) || "must be a calendar id like abc123@group.calendar.google.com",
  TIMETABLE_FEED_KEY: (v) =>
    Buffer.from(v, "base64").length >= 32 || "must be at least 32 bytes of base64 (openssl rand -base64 32)",
  ADMIN_EMAILS: (v) => v.split(",").every((e) => e.trim().includes("@")) || "must be comma-separated email addresses",
};

if (!REQUIRED[config]) {
  console.error(`Unknown config "${config}". Use one of: ${Object.keys(REQUIRED).join(", ")}.`);
  process.exit(2);
}

let secrets;
try {
  const out = execFileSync("scripts/doppler.sh", ["secrets", "download", "--no-file", "--format", "json", "-p", "volsoc-webapp", "-c", config], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  secrets = JSON.parse(out);
} catch (e) {
  console.error(`Couldn't read Doppler config "${config}". Run \`doppler-volsoc login\` (or \`doppler login\` to the VolSoc workplace) first.\n${e.stderr ?? e.message}`);
  process.exit(2);
}

const problems = [];
for (const name of REQUIRED[config]) {
  if (!secrets[name]?.trim()) problems.push(`${name} is missing`);
}
for (const [name, check] of Object.entries(SHAPE)) {
  const value = secrets[name];
  if (!value) continue;
  const result = check(value, secrets);
  if (result !== true) problems.push(`${name} ${result}`);
}

if (problems.length) {
  console.error(`✗ ${config}: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const optional = OPTIONAL.filter((name) => secrets[name]?.trim());
console.log(
  `✓ ${config}: ${REQUIRED[config].length} required secrets present, shapes check out` +
    (optional.length ? ` (optional set: ${optional.join(", ")})` : ""),
);
