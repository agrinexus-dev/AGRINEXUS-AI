"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * UI-UPGRADE.2 (Operator Light Theme Foundation) — widened from the
 * previous dark-only single-member union, exactly as that union's own doc
 * comment anticipated ("Widening this to `"dark" | "light"` and wiring a
 * real `setTheme` is the only change needed to introduce light mode
 * later"). Deliberately still just these two — no `"system"` member, per
 * the explicit "do not add System theme" instruction.
 */
export type Theme = "dark" | "light";

/** Same naming convention this repo already uses for its other persisted client preferences (`farmer-settings-store.ts`'s `"farmer-settings"`, `aura-settings-store.ts`'s `"aura-settings"`). */
const THEME_STORAGE_KEY = "operator-theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    // localStorage can legitimately be unavailable (private browsing,
    // quota, disabled storage) — dark is the documented, correct default.
    return "dark";
  }
}

/**
 * UI-UPGRADE.2 — extends the existing Context (never replaced; this repo
 * already has a real theme-provider mechanism, so per the governing
 * instruction the correct move is widening it, not introducing a second
 * mechanism like `next-themes` or a new Zustand store).
 *
 * Dark stays the server-rendered default (`<html className="dark">` in
 * `layout.tsx`, unchanged) — this component's own `useState("dark")`
 * initial value matches that exactly, so there is no hydration mismatch:
 * React's first client render agrees with what the server already sent.
 * The REAL persisted preference (if the operator previously chose light)
 * is read once, after mount, and applied then. A one-time flash from dark
 * to light for a returning light-mode operator is possible in the
 * millisecond before that effect runs; `layout.tsx`'s own small
 * pre-hydration inline script (see that file) removes the flash for the
 * common case by applying the stored class before React even mounts —
 * this component's post-mount read is the fallback/source-of-truth for
 * every subsequent `setTheme` call, not a duplicate mechanism.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  function setTheme(next: Theme): void {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Theme still applies for this session; it just won't survive a
      // reload — the same honest degradation `readStoredTheme` documents.
    }
  }

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
