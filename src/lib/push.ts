import { connect, type ClientHttp2Session } from "node:http2";
import { SignJWT, importPKCS8 } from "jose";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Push notifications to the phone app, straight to the two services with no
 * middleman: APNs for iPhones, FCM for Android. Each is optional and silent
 * when its env vars aren't set, so the site works the same before the keys
 * exist (see the table in the README).
 *
 *   iOS      APNS_KEY (the .p8, newlines may be written \n), APNS_KEY_ID,
 *            APNS_TEAM_ID; APNS_HOST=api.sandbox.push.apple.com for a debug build
 *   Android  FCM_SERVICE_ACCOUNT: the Firebase service-account JSON, as is
 */

const BUNDLE_ID = "org.uclvolunteering.app";

export interface PushMessage {
  title: string;
  body: string;
  /** Opened in the app when the notification is tapped. */
  url: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Devices that can't be reached because the keys aren't configured. */
  skipped: number;
}

type Outcome = "sent" | "failed" | "dead";

interface Device {
  token: string;
  platform: "ios" | "android";
}

const env = (name: string) => process.env[name]?.trim() || "";

// ── APNs ──

let apnsJwt: { token: string; at: number } | null = null;

async function apnsAuth(): Promise<string> {
  // Apple wants the token reused for 20–60 minutes, not minted per request.
  if (apnsJwt && Date.now() - apnsJwt.at < 40 * 60_000) return apnsJwt.token;
  const key = await importPKCS8(env("APNS_KEY").replace(/\\n/g, "\n"), "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env("APNS_KEY_ID") })
    .setIssuer(env("APNS_TEAM_ID"))
    .setIssuedAt()
    .sign(key);
  apnsJwt = { token, at: Date.now() };
  return token;
}

const apnsConfigured = () => Boolean(env("APNS_KEY") && env("APNS_KEY_ID") && env("APNS_TEAM_ID"));

function apnsSend(session: ClientHttp2Session, auth: string, token: string, message: PushMessage): Promise<Outcome> {
  return new Promise((resolve) => {
    const request = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${auth}`,
      "apns-topic": BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
    });
    let status = 0;
    let reason = "";
    request.setTimeout(10_000, () => request.close());
    request.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    request.on("data", (chunk: Buffer) => {
      reason += chunk.toString();
    });
    request.on("error", () => resolve("failed"));
    request.on("close", () => {
      if (status === 200) return resolve("sent");
      if (status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(reason)) return resolve("dead");
      console.error(`[push] APNs ${status}: ${reason}`);
      resolve("failed");
    });
    request.end(
      JSON.stringify({
        aps: { alert: { title: message.title, body: message.body }, sound: "default" },
        url: message.url,
      }),
    );
  });
}

async function sendIos(devices: Device[], message: PushMessage): Promise<Map<string, Outcome>> {
  const results = new Map<string, Outcome>();
  const auth = await apnsAuth();
  const session = connect(`https://${env("APNS_HOST") || "api.push.apple.com"}`);
  session.on("error", () => undefined);
  try {
    await Promise.all(devices.map(async (d) => results.set(d.token, await apnsSend(session, auth, d.token, message))));
  } finally {
    session.close();
  }
  return results;
}

// ── FCM ──

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function serviceAccount(): ServiceAccount | null {
  try {
    const parsed = JSON.parse(env("FCM_SERVICE_ACCOUNT")) as Partial<ServiceAccount>;
    return parsed.project_id && parsed.client_email && parsed.private_key ? (parsed as ServiceAccount) : null;
  } catch {
    return null;
  }
}

let fcmAccess: { token: string; expires: number } | null = null;

async function fcmAuth(account: ServiceAccount): Promise<string> {
  if (fcmAccess && Date.now() < fcmAccess.expires - 60_000) return fcmAccess.token;
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !body?.access_token) throw new Error(`Google sign-in for FCM failed (HTTP ${res.status})`);
  fcmAccess = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return fcmAccess.token;
}

async function sendAndroid(devices: Device[], message: PushMessage): Promise<Map<string, Outcome>> {
  const results = new Map<string, Outcome>();
  const account = serviceAccount()!;
  const auth = await fcmAuth(account);
  await Promise.all(
    devices.map(async ({ token }) => {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: message.title, body: message.body },
              data: { url: message.url },
              android: { priority: "HIGH" },
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return results.set(token, "sent");
        const text = await res.text();
        if (res.status === 404 || /UNREGISTERED/.test(text)) return results.set(token, "dead");
        console.error(`[push] FCM ${res.status}: ${text.slice(0, 300)}`);
        results.set(token, "failed");
      } catch (e) {
        console.error(`[push] FCM request failed: ${e instanceof Error ? e.message : e}`);
        results.set(token, "failed");
      }
    }),
  );
  return results;
}

/** Send to these devices. A failure for one phone never stops the rest; a token the service says is dead is forgotten. */
async function deliver(devices: Device[], message: PushMessage): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, skipped: 0 };
  const dead: string[] = [];

  const groups: [Device[], boolean, (d: Device[], m: PushMessage) => Promise<Map<string, Outcome>>][] = [
    [devices.filter((d) => d.platform === "ios"), apnsConfigured(), sendIos],
    [devices.filter((d) => d.platform === "android"), serviceAccount() !== null, sendAndroid],
  ];
  for (const [group, configured, send] of groups) {
    if (!group.length) continue;
    if (!configured) {
      result.skipped += group.length;
      continue;
    }
    try {
      for (const [token, outcome] of await send(group, message)) {
        if (outcome === "sent") result.sent++;
        else {
          result.failed++;
          if (outcome === "dead") dead.push(token);
        }
      }
    } catch (e) {
      console.error(`[push] sending failed: ${e instanceof Error ? e.message : e}`);
      result.failed += group.length;
    }
  }

  if (dead.length) await getSupabaseAdmin().from("push_devices").delete().in("token", dead);
  return result;
}

/** Each kind of notification a phone can switch off on its own (Settings). */
export type PushTopic = "food_alerts" | "task_reminders";

async function devicesWhere(topic: PushTopic, memberId?: string): Promise<Device[]> {
  let query = getSupabaseAdmin().from("push_devices").select("token,platform").eq(topic, true);
  if (memberId) query = query.eq("member_id", memberId);
  const { data, error } = await query;
  if (error) {
    console.error(`[push] couldn't read the devices: ${error.message}`);
    return [];
  }
  return (data ?? []) as Device[];
}

/** Notify every device that opted in to food alerts. */
export async function pushToEveryone(message: PushMessage): Promise<PushResult> {
  return deliver(await devicesWhere("food_alerts"), message);
}

/** Send one member their task reminders: the phones they opted in while signed in. */
export async function pushToMember(memberId: string, message: PushMessage): Promise<PushResult> {
  return deliver(await devicesWhere("task_reminders", memberId), message);
}
