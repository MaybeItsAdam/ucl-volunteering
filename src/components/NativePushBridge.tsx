"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

/**
 * Tapping a notification opens the page it names (`url`, a path on this site).
 * Only listens: it never asks for permission or registers, that is the
 * "Notify me" button's job. Renders nothing on the web.
 */
export function NativePushBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("PushNotifications")) return;
    const handle = PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const url = (notification.data as { url?: unknown } | undefined)?.url;
      if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//")) window.location.assign(url);
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);
  return null;
}
