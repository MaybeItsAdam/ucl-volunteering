"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Bell } from "lucide-react";

const TOKEN_KEY = "volsoc:push-token";

type State = "hidden" | "off" | "on" | "blocked" | "busy";

const stored = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

function remember(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Without storage the button just starts from "Notify me" next launch.
  }
}

/** Ask the phone for its push token. Resolves when the OS answers, or gives up after 15s. */
async function registerDevice(): Promise<string> {
  const handles: { remove: () => Promise<void> }[] = [];
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The phone didn't answer, try again")), 15_000);
      void (async () => {
        handles.push(
          await PushNotifications.addListener("registration", (t) => {
            clearTimeout(timer);
            resolve(t.value);
          }),
          await PushNotifications.addListener("registrationError", (e) => {
            clearTimeout(timer);
            reject(new Error(e.error || "Notifications couldn't be switched on"));
          }),
        );
        await PushNotifications.register();
      })().catch(reject);
    });
  } finally {
    await Promise.all(handles.map((h) => h.remove()));
  }
}

async function tellServer(token: string) {
  const res = await fetch("/api/push/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Couldn't save that, try again");
  }
}

/**
 * "Notify me when food is ready to collect", in the phone app only. Nothing is
 * asked of the person until they press the button: that press is what shows the
 * system permission prompt and registers the phone. Once on, each launch quietly
 * re-registers, because push tokens change. Renders nothing on the web, and in
 * an older build of the app that doesn't have the push plugin.
 */
export function CollectionAlerts({ blurb = "Get a notification when a café has food ready to collect. Nothing else", onBlurb = "You'll get a notification when a café has food ready to collect" }: { blurb?: string; onBlurb?: string }) {
  const [state, setState] = useState<State>("hidden");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("PushNotifications")) return;
    let live = true;
    void (async () => {
      const { receive } = await PushNotifications.checkPermissions();
      if (!live) return;
      if (receive === "denied") return setState("blocked");
      if (receive !== "granted" || !stored()) return setState("off");
      setState("on");
      try {
        await tellServer(await registerDevice());
      } catch {
        // Still on; the next launch tries again.
      }
    })().catch(() => live && setState("off"));
    return () => {
      live = false;
    };
  }, []);

  async function turnOn() {
    setError(null);
    setState("busy");
    try {
      const { receive } = await PushNotifications.requestPermissions();
      if (receive !== "granted") return setState("blocked");
      const token = await registerDevice();
      await tellServer(token);
      remember(token);
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Notifications couldn't be switched on");
      setState("off");
    }
  }

  async function turnOff() {
    const token = stored();
    remember(null);
    setState("off");
    if (!token) return;
    await fetch("/api/push/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => undefined);
  }

  if (state === "hidden") return null;
  return (
    <section className="panel col-optin" aria-labelledby="col-optin-title">
      <h2 id="col-optin-title" className="micro-label">
        Notifications
      </h2>
      {state === "on" ? (
        <>
          <p>
            <Bell size={16} aria-hidden="true" /> {onBlurb}
          </p>
          <button type="button" className="button small" onClick={turnOff}>
            Turn off
          </button>
        </>
      ) : state === "blocked" ? (
        <p className="muted">Notifications are off for VolSoc. Switch them on in your phone&apos;s settings, then come back here</p>
      ) : (
        <>
          <p className="muted">{blurb}</p>
          <button type="button" className="button primary" onClick={turnOn} disabled={state === "busy"}>
            {state === "busy" ? "Switching on…" : "Notify me"}
          </button>
          {error && (
            <p className="col-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
