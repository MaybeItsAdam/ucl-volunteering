"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { parseAppCallback } from "@/lib/authCallback";

// A token is single-use, and App.getLaunchUrl() keeps returning the URL that
// cold-started the app for as long as the process lives, so remember which
// handoffs this app session has already spent.
const SPENT_KEY = "volsoc:spent-auth-tokens";

function claimToken(token: string): boolean {
  try {
    const spent: string[] = JSON.parse(sessionStorage.getItem(SPENT_KEY) || "[]");
    if (spent.includes(token)) return false;
    sessionStorage.setItem(SPENT_KEY, JSON.stringify([...spent.slice(-4), token]));
  } catch {
    // Without storage the worst case is a repeat exchange that fails harmlessly.
  }
  return true;
}

/**
 * UCL sign-in in the phone app, as ucl-hiking does it. Microsoft's sign-in
 * belongs in the system browser (saved logins, passkeys), so a tap on any
 * link to /api/auth/start opens it there with `native=1`; the callback page
 * hands the token back through uclvolunteering://auth/callback, and this swaps
 * it for the session cookie inside the app. Renders nothing on the web.
 */
export function NativeAuthBridge() {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;

    function onClick(event: MouseEvent) {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== "/api/auth/start") return;
      event.preventDefault();
      url.searchParams.set("native", "1");
      void Browser.open({ url: url.toString() });
    }

    async function handle(rawUrl: string | undefined) {
      const callback = rawUrl ? parseAppCallback(rawUrl) : null;
      if (!active || !callback || !claimToken(callback.token)) return;
      setBusy(true);
      await Browser.close().catch(() => undefined);
      try {
        const response = await fetch("/api/auth/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: callback.token }),
        });
        const body = (await response.json().catch(() => null)) as { error?: string; redirectTo?: string } | null;
        if (!response.ok) throw new Error(body?.error || `Sign-in hit a problem on our side (error ${response.status})`);
        window.location.replace(callback.next ?? body?.redirectTo ?? "/portal");
      } catch (error) {
        setBusy(false);
        window.alert(error instanceof Error ? error.message : "Sign-in didn't work, try again");
      }
    }

    document.addEventListener("click", onClick, true);
    const listener = App.addListener("appUrlOpen", ({ url }) => void handle(url));
    // If the phone reclaimed the app while the browser was open, the callback
    // cold-starts it instead of firing appUrlOpen on a live page.
    void App.getLaunchUrl().then((launch) => handle(launch?.url));

    return () => {
      active = false;
      document.removeEventListener("click", onClick, true);
      void listener.then((h) => h.remove());
    };
  }, []);

  if (!busy) return null;
  return (
    <div className="native-auth-overlay" role="status" aria-live="polite">
      <p>Signing you in…</p>
    </div>
  );
}
