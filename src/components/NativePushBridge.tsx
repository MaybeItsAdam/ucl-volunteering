"use client";

import { useEffect } from "react";
import { PushNotifications } from "@capacitor/push-notifications";
import { canPush, refreshPushRegistration } from "@/components/pushDevice";

/**
 * Tapping a notification opens the page it names (`url`, a path on this site).
 * On launch, a phone that already opted in registers again, because push
 * tokens change. It never asks for permission: that is the "Notify me"
 * button's job. Renders nothing, and does nothing on the web.
 */
export function NativePushBridge() {
  useEffect(() => {
    if (!canPush()) return;
    void refreshPushRegistration().catch(() => undefined);
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
