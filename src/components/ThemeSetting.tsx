"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

// Same-tab changes don't fire "storage", so choose() notifies subscribers itself.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function choose(next: ThemeChoice) {
  const root = document.documentElement;
  if (next === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", next);
  try {
    if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage blocked: the choice still applies until the app is closed.
  }
  listeners.forEach((listener) => listener());
}

// The server can't see localStorage, so it renders "system" and hydration then
// switches to the saved choice without a mismatch.
const useThemeChoice = () => useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);

/**
 * One tap between light and dark, in the top bar. From "system" it flips
 * whatever the system is showing now; the three-way choice stays in Settings.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const choice = useThemeChoice();
  function toggle() {
    const showing =
      choice === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : choice;
    choose(showing === "dark" ? "light" : "dark");
  }
  // Both icons render; CSS shows the one for the theme on screen, so a system
  // dark mode is right before hydration too.
  return (
    <button
      type="button"
      className={`icon-button theme-toggle${className ? ` ${className}` : ""}`}
      onClick={toggle}
      aria-label="Switch between light and dark mode"
      title="Light or dark"
    >
      <Moon size={18} aria-hidden="true" className="theme-toggle-moon" />
      <Sun size={18} aria-hidden="true" className="theme-toggle-sun" />
    </button>
  );
}

export function ThemeSetting() {
  const choice = useThemeChoice();

  return (
    <div className="theme-setting" role="radiogroup" aria-label="Appearance">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          className={choice === value ? "is-selected" : undefined}
          onClick={() => choose(value)}
        >
          <Icon size={16} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
