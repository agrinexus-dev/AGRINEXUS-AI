import type { PersistedWorkspaceLayout } from "./types";

const STORAGE_KEY = "agrinexus.operator.workspace-layout.v1";

/** Guarded so this module is safe to import from code that also runs during SSR. */
export function loadPersistedLayout(): PersistedWorkspaceLayout | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      (parsed as { version: unknown }).version === 1
    ) {
      return parsed as PersistedWorkspaceLayout;
    }
    return null;
  } catch {
    return null;
  }
}

export function savePersistedLayout(layout: PersistedWorkspaceLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Storage can fail (quota, private browsing) — layout persistence is a nicety, not critical.
  }
}

export function clearPersistedLayout(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same non-critical rationale as above.
  }
}
