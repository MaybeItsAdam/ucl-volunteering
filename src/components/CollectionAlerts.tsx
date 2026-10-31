"use client";

import { Bell } from "lucide-react";
import { usePushDevice } from "@/components/pushDevice";

/**
 * "Notify me when food is ready to collect", on the Zero Food Waste page and
 * in the phone app only — the one place someone signed out can switch it on.
 * Signed in, the finer controls are in Settings. Renders nothing on the web.
 */
export function CollectionAlerts() {
  const { state, preferences, error, turnOn, setPreference } = usePushDevice();

  if (state === "hidden") return null;
  const on = state === "on";
  const getsFood = on && preferences?.food_alerts !== false;
  return (
    <section className="panel col-optin" aria-labelledby="col-optin-title">
      <h2 id="col-optin-title" className="micro-label">
        Notifications
      </h2>
      {getsFood ? (
        <p className="muted">
          <Bell size={16} aria-hidden="true" /> You&apos;ll get a notification when a café has food ready to collect
        </p>
      ) : state === "blocked" ? (
        <p className="muted">Notifications are off for VolSoc. Switch them on in your phone&apos;s settings, then come back here</p>
      ) : (
        <>
          <p className="muted">Get a notification when a café has food ready to collect. Nothing else</p>
          <button
            type="button"
            className="button primary"
            onClick={() => void (on ? setPreference("food_alerts", true) : turnOn())}
            disabled={state === "busy" || (on && !preferences)}
          >
            {state === "busy" ? "Switching on…" : "Notify me"}
          </button>
        </>
      )}
      {error && (
        <p className="col-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
