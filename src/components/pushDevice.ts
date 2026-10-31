"use client";

import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import type { PushPreferences } from "@/lib/types";

export type { PushPreferences };
export type PushTopic = keyof PushPreferences;

const TOKEN_KEY = "volsoc:push-token";

export const storedPushToken = () => {
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

/** Whether this is the phone app with the push plugin (an older build may not have it). */
export const canPush = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("PushNotifications");

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

async function send(method: "POST" | "PATCH", body: Record<string, unknown>): Promise<PushPreferences> {
  const res = await fetch("/api/push/devices", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { error?: string; preferences?: PushPreferences } | null;
  if (!res.ok || !data?.preferences) throw new Error(data?.error || "Couldn't save that, try again");
  return data.preferences;
}

const tellServer = (token: string, previous?: string | null) =>
  send("POST", { token, platform: Capacitor.getPlatform(), previous: previous ?? undefined });

/**
 * On each launch of the app, for a phone that opted in: register again,
 * because push tokens change, and tell the server (carrying the phone's
 * preferences over if the token did change). Quiet on any failure.
 */
export async function refreshPushRegistration(): Promise<void> {
  if (!canPush()) return;
  const previous = storedPushToken();
  if (!previous) return;
  const { receive } = await PushNotifications.checkPermissions();
  if (receive !== "granted") return;
  const token = await registerDevice();
  await tellServer(token, previous);
  remember(token);
}

export type PushState = "hidden" | "off" | "on" | "blocked" | "busy";

/**
 * This phone's notifications: whether they're on, and which kinds. Nothing is
 * asked of the person until turnOn(): that is what shows the system
 * permission prompt and registers the phone. "hidden" on the web.
 */
export function usePushDevice() {
  const [state, setState] = useState<PushState>("hidden");
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canPush()) return;
    let live = true;
    void (async () => {
      const { receive } = await PushNotifications.checkPermissions();
      if (!live) return;
      const token = storedPushToken();
      if (receive === "denied") return setState("blocked");
      if (receive !== "granted" || !token) return setState("off");
      setState("on");
      // Reading the preferences back is the same call as the launch refresh.
      const prefs = await tellServer(token).catch(() => null);
      if (live && prefs) setPreferences(prefs);
    })().catch(() => live && setState("off"));
    return () => {
      live = false;
    };
  }, []);

  const turnOn = useCallback(async () => {
    setError(null);
    setState("busy");
    try {
      const { receive } = await PushNotifications.requestPermissions();
      if (receive !== "granted") return setState("blocked");
      const token = await registerDevice();
      setPreferences(await tellServer(token, storedPushToken()));
      remember(token);
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Notifications couldn't be switched on");
      setState("off");
    }
  }, []);

  const turnOff = useCallback(async () => {
    const token = storedPushToken();
    remember(null);
    setState("off");
    setPreferences(null);
    if (!token) return;
    await fetch("/api/push/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => undefined);
  }, []);

  const setPreference = useCallback(
    async (topic: PushTopic, on: boolean) => {
      const token = storedPushToken();
      if (!token || !preferences) return;
      const before = preferences;
      setError(null);
      setPreferences({ ...before, [topic]: on });
      try {
        setPreferences(await send("PATCH", { token, [topic]: on }));
      } catch (e) {
        setPreferences(before);
        setError(e instanceof Error ? e.message : "Couldn't save that, try again");
      }
    },
    [preferences],
  );

  return { state, preferences, error, turnOn, turnOff, setPreference };
}
