#!/usr/bin/env node
// Store screenshots and the Google Play feature graphic
//
// Captures real pages of the app with Playwright, drops each capture into
// scripts/store-assets/screenshot.html (headline + flat device frame on cyan),
// and writes exact-size, alpha-free PNGs into assets/store/
//
//   node scripts/store-screenshots.mjs                 # everything
//   node scripts/store-screenshots.mjs --only feature  # just the feature graphic
//   node scripts/store-screenshots.mjs --only iphone-69,android-phone
//
// Needs:
// - Playwright with Chromium. Not a repo dependency: point PLAYWRIGHT_DIR at any
//   folder with node_modules/playwright (default /tmp/shots)
// - ImageMagick (magick) to strip alpha
// - The app on VOLSOC_BASE (default http://localhost:3130), e.g. `npm run dev`
// - Optional, for the signed-in volunteer form: a second dev server with NO
//   secrets on VOLSOC_FORM_BASE (default http://localhost:3131), started with
//   `env -i HOME=$HOME PATH=$PATH npx next dev --webpack -p 3131` from a copy of
//   the repo without .env files. It signs a demo session with the public
//   local-development secret, which only a secret-free dev server accepts, so
//   nothing touches the real database. Without it the signed-out page is used
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.VOLSOC_BASE ?? "http://localhost:3130";
const FORM_BASE = process.env.VOLSOC_FORM_BASE ?? "http://localhost:3131";
const DEV_SECRET = "volsoc-local-development-only-session-secret";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const dir = process.env.PLAYWRIGHT_DIR ?? "/tmp/shots";
    return createRequire(path.join(dir, "package.json"))("playwright");
  }
}

// Output sizes. `dpr` maps the template's CSS size onto the exact pixel size;
// `deviceW` is the frame width as a share of the canvas; `scale` is how much the
// app is shrunk inside the frame (so phones get a real ~400px phone layout)
const TARGETS = {
  "iphone-69": { dir: "ios/iphone-69", w: 1320, h: 2868, dpr: 3, deviceW: 0.8, scale: 0.82, bezel: 11, radius: 46 },
  "iphone-65": { dir: "ios/iphone-65", w: 1284, h: 2778, dpr: 3, deviceW: 0.8, scale: 0.82, bezel: 11, radius: 44 },
  "ipad-13": { dir: "ios/ipad-13", w: 2064, h: 2752, dpr: 2, deviceW: 0.84, scale: 0.86, bezel: 18, radius: 40, headline: "62px" },
  "android-phone": { dir: "android/phone", w: 1080, h: 1920, dpr: 2.5, deviceW: 0.74, scale: 0.8, bezel: 10, radius: 38 },
  "android-tablet-7": { dir: "android/tablet-7", w: 1200, h: 1920, dpr: 2, deviceW: 0.8, scale: 0.84, bezel: 14, radius: 36, headline: "46px" },
  "android-tablet-10": { dir: "android/tablet-10", w: 1600, h: 2560, dpr: 2, deviceW: 0.84, scale: 0.72, bezel: 16, radius: 38, headline: "56px" },
};

const SHOTS = [
  { name: "01-calendar", path: "/calendar", headline: "Every Volunteering event at UCL", prepare: prepareCalendar },
  { name: "02-list", path: "/calendar?view=list", headline: "See what's on across UCL societies" },
  { name: "03-volunteer", path: "/volunteer", headline: "Sign up to Volunteer with your UCL login", prepare: prepareVolunteer, signedIn: true },
  { name: "04-zero-food-waste", path: "/zero-food-waste", headline: "Log a Zero Food Waste shift in a minute", prepare: prepareZfw },
  { name: "05-home", path: "/", headline: "UCL Volunteering Society, in your pocket" },
];

// Next week: the current one may be nearly over and sparse
async function prepareCalendar(page) {
  const next = page.getByRole("button", { name: "Next week" });
  if ((await next.count()) && (await next.isEnabled())) {
    await next.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
  }
  // On phones the week scrolls sideways: bring the busiest day into view
  if (page.viewportSize().width >= 700) return;
  await page.evaluate(() => {
    const cols = [...document.querySelectorAll(".cal-col")];
    const busiest = cols.reduce((a, b) => (b.children.length > (a?.children.length ?? -1) ? b : a), null);
    let el = busiest?.parentElement;
    while (el && el.scrollWidth <= el.clientWidth + 1) el = el.parentElement;
    if (!busiest || !el || el === document.documentElement || el === document.body) return;
    const gutter = document.querySelector(".cal-gutter")?.getBoundingClientRect().width ?? 0;
    el.scrollLeft += busiest.getBoundingClientRect().left - el.getBoundingClientRect().left - gutter;
  });
}

// Demo answers typed into the page only; nothing is ever submitted
async function prepareVolunteer(page) {
  const radio = page.getByLabel("Every couple of weeks");
  if (await radio.count()) await radio.check();
  for (const label of ["Term 1 (Sep–Dec)", "Term 2 (Jan–Mar)"]) {
    const box = page.getByLabel(label, { exact: true });
    if (await box.count()) await box.check();
  }
}

async function prepareZfw(page) {
  const leader = page.locator("#z-leader");
  if (await leader.count()) await leader.fill("Priya Shah");
  const outlet = page.locator("#z-outlet");
  if (await outlet.count()) await outlet.selectOption({ index: 1 });
  const taps = { mains: 14, "fruit and yoghurt pots": 6, "pastries and pasties": 9, snacks: 4 };
  for (const [label, n] of Object.entries(taps)) {
    const plus = page.getByRole("button", { name: `One more ${label}` });
    if (!(await plus.count())) continue;
    for (let i = 0; i < n; i++) await plus.click();
  }
  await page.evaluate(() => document.activeElement?.blur());
}

async function demoToken() {
  try {
    const require = createRequire(path.join(root, "package.json"));
    const { SignJWT } = await import(pathToFileURL(require.resolve("jose")).href);
    return await new SignJWT({
      toolboxUserId: "store-demo",
      memberId: "member-store-demo",
      email: "sam.okafor.24@ucl.ac.uk",
      name: "Sam Okafor",
      governanceRoleAtSignIn: null,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(DEV_SECRET));
  } catch {
    return null;
  }
}

async function reachable(url) {
  try {
    const res = await fetch(url, { redirect: "manual" });
    return res.status < 500;
  } catch {
    return false;
  }
}

function flatten(src, out, w, h) {
  execFileSync("magick", [src, "-background", "#FEEFE5", "-alpha", "remove", "-alpha", "off", "-resize", `${w}x${h}!`, "-type", "TrueColor", `PNG24:${out}`]);
  const got = execFileSync("magick", ["identify", "-format", "%wx%h", out]).toString();
  if (got !== `${w}x${h}`) throw new Error(`${out} came out ${got}, expected ${w}x${h}`);
}

const args = process.argv.slice(2);
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",")) : null;
const want = (key) => !only || only.has(key);

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const work = mkdtempSync(path.join(tmpdir(), "volsoc-store-"));
const templateUrl = pathToFileURL(path.join(root, "scripts/store-assets/screenshot.html")).href;
const storeDir = path.join(root, "assets/store");

try {
  if (want("feature")) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(root, "scripts/store-assets/feature-graphic.html")).href);
    await page.evaluate(() => document.fonts.ready);
    const raw = path.join(work, "feature.png");
    await page.screenshot({ path: raw });
    flatten(raw, path.join(storeDir, "google-play-feature-graphic.png"), 1024, 500);
    console.log("feature graphic 1024x500");
    await page.close();
  }

  const formOk = (await reachable(`${FORM_BASE}/volunteer`)) ? await demoToken() : null;
  if (!formOk) console.warn(`No secret-free dev server on ${FORM_BASE}: volunteer shot will be signed out`);

  for (const [key, t] of Object.entries(TARGETS)) {
    if (!want(key)) continue;
    const outDir = path.join(storeDir, "screenshots", t.dir);
    mkdirSync(outDir, { recursive: true });
    const cssW = t.w / t.dpr;
    const cssH = t.h / t.dpr;
    const frame = await browser.newPage({ viewport: { width: cssW, height: cssH }, deviceScaleFactor: t.dpr });
    await frame.goto(templateUrl);
    await frame.evaluate(({ cssW, cssH, t }) => {
      const s = document.documentElement.style;
      s.setProperty("--w", `${cssW}px`);
      s.setProperty("--h", `${cssH}px`);
      s.setProperty("--device-w", String(t.deviceW));
      s.setProperty("--bezel", `${t.bezel}px`);
      s.setProperty("--radius", `${t.radius}px`);
      if (t.headline) s.setProperty("--headline", t.headline);
    }, { cssW, cssH, t });

    for (const shot of SHOTS) {
      await frame.evaluate((text) => (document.getElementById("headline").textContent = text), shot.headline);
      await frame.evaluate(() => document.fonts.ready);
      const box = await frame.locator("#screen").boundingBox();
      const viewport = { width: Math.round(box.width / t.scale), height: Math.round(box.height / t.scale) };
      const signedIn = shot.signedIn && formOk;
      const base = signedIn ? FORM_BASE : BASE;
      const ctx = await browser.newContext({
        viewport,
        deviceScaleFactor: 3,
        // isMobile would let any stray horizontal overflow zoom the whole page out
        isMobile: false,
        hasTouch: true,
        colorScheme: "light",
        locale: "en-GB",
        timezoneId: "Europe/London",
      });
      if (signedIn) await ctx.addCookies([{ name: "volsoc_session", value: formOk, url: FORM_BASE }]);
      const page = await ctx.newPage();
      await page.goto(base + shot.path, { waitUntil: "networkidle" });
      // A phone's safe areas, which a desktop browser reports as 0: phones keep
      // the tab bar above the home indicator, and the frame's rounded corners
      // would otherwise crop it. Tablets have no notch, only the indicator.
      const safe = viewport.width < 600 ? { top: 47, bottom: 24 } : { top: 24, bottom: 20 };
      await page.addStyleTag({
        content: `nextjs-portal{display:none!important} *{caret-color:transparent!important}
          :root{--safe-top:${safe.top}px!important;--safe-bottom:${safe.bottom}px!important}`,
      });
      if (shot.prepare) await shot.prepare(page);
      await page.mouse.move(1, viewport.height - 1); // no hover states in the shot
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(700);
      const capture = path.join(work, `${key}-${shot.name}-capture.png`);
      await page.screenshot({ path: capture });
      await ctx.close();

      await frame.evaluate((src) => new Promise((resolve) => {
        const img = document.getElementById("capture");
        img.onload = () => resolve();
        img.src = src;
      }), pathToFileURL(capture).href);
      const raw = path.join(work, `${key}-${shot.name}.png`);
      await frame.screenshot({ path: raw });
      flatten(raw, path.join(outDir, `${shot.name}.png`), t.w, t.h);
      console.log(`${key} ${shot.name} ${t.w}x${t.h} (app at ${viewport.width}x${viewport.height})`);
    }
    await frame.close();
  }
} finally {
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}
