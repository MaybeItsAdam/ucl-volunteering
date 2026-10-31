"use client";

import { useState } from "react";
import { BellOff, Smartphone } from "lucide-react";
import { usePushDevice, type PushTopic } from "@/components/pushDevice";

const TOPICS: { topic: PushTopic; label: string; detail: string; committee?: boolean }[] = [
  {
    topic: "food_alerts",
    label: "Food ready to collect",
    detail: "When a café posts Zero Food Waste food for volunteers to pick up",
  },
  {
    topic: "task_reminders",
    label: "Task reminders",
    detail: "Each morning, when something of yours on the planner is overdue or due soon",
    committee: true,
  },
];

/**
 * Settings → Notifications. In the phone app: on/off for this phone and a
 * switch per kind. On the web, where nothing can be pushed: how many phones
 * are getting this member's notifications, and a way to stop them all.
 */
export function NotificationSettings({ committee, phones }: { committee: boolean; phones: number }) {
  const { state, preferences, error, turnOn, turnOff, setPreference } = usePushDevice();
  const topics = TOPICS.filter((t) => committee || !t.committee);

  if (state === "hidden") return <WebNotifications phones={phones} />;

  if (state === "blocked") {
    return (
      <p className="muted">
        Notifications are off for VolSoc in your phone&apos;s settings. Switch them on there, then come back here
      </p>
    );
  }

  if (state !== "on") {
    return (
      <>
        <p className="muted">
          Nothing is sent until you switch it on, and then only what you pick below. You can change it any time
        </p>
        <button type="button" className="button primary" onClick={() => void turnOn()} disabled={state === "busy"}>
          {state === "busy" ? "Switching on…" : "Turn on notifications"}
        </button>
        {error && <p className="settings-error" role="alert">{error}</p>}
      </>
    );
  }

  return (
    <>
      <ul className="settings-switches">
        {topics.map(({ topic, label, detail }) => (
          <li key={topic}>
            <label>
              <span>
                <strong>{label}</strong>
                <span className="muted small">{detail}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={preferences?.[topic] ?? false}
                disabled={!preferences}
                onChange={(e) => void setPreference(topic, e.target.checked)}
              />
            </label>
          </li>
        ))}
      </ul>
      {!preferences && !error && <p className="muted small">Loading this phone&apos;s choices…</p>}
      {error && <p className="settings-error" role="alert">{error}</p>}
      <button type="button" className="button small" onClick={() => void turnOff()}>
        <BellOff size={14} aria-hidden="true" /> Turn off on this phone
      </button>
    </>
  );
}

function WebNotifications({ phones: initial }: { phones: number }) {
  const [phones, setPhones] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stopAll() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/push/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) setPhones(0);
    else setError("Couldn't stop them, try again in a minute");
  }

  return (
    <>
      <p className="muted">
        Notifications come through the VolSoc phone app: open Settings there to choose which ones you get
      </p>
      {phones > 0 && (
        <div className="settings-row">
          <span>
            <Smartphone size={16} aria-hidden="true" /> {phones === 1 ? "One phone gets" : `${phones} phones get`} your
            notifications
          </span>
          <button type="button" className="button small danger" onClick={() => void stopAll()} disabled={busy}>
            {busy ? "Stopping…" : "Stop all"}
          </button>
        </div>
      )}
      {error && <p className="settings-error" role="alert">{error}</p>}
    </>
  );
}
