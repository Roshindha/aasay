"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "./icons";

type Theme = "light" | "dark";
const listeners = new Set<() => void>();
const read = (): Theme => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function setTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("assay-theme", t); } catch { /* storage may be unavailable */ }
  listeners.forEach((l) => l());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "dark" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}
      className="inline-flex h-8 w-8 items-center justify-center rounded border border-line bg-surface text-fg hover:bg-surface-2">
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}
