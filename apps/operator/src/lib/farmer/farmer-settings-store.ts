"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The Farmer Settings foundation's persisted preferences.
 * Deliberately client-only (localStorage), same pattern `aura-settings-
 * store.ts` already uses for provider/model — no backend model exists (or
 * is needed) for simple per-browser preferences like these, and Part 25
 * explicitly says not to build a complete notification system this change.
 *
 * Two fields are genuinely WIRED into real behavior, not inert placeholders:
 *  - `actionConfirmationRequired` gates whether `action-executor.ts`'s
 *  "handle-selected-finding" proposes-then-confirms (Part 13, the default)
 *  or executes immediately (the Farmer opted out of confirmation).
 *  - `auraLanguage` is folded into the system prompt as the LAST-RESORT
 *  fallback (`collect-context.ts` → `prompt-builder.ts`), used only on a
 *  turn where the automatic per-turn conversation-language detector
 *  (`lib/aura/voice/language-detection.ts`) can't confidently
 *  tell English from Urdu. It is NO LONGER a user-facing setting — the
 *  "AURA reply language" Settings control was removed
 *  entirely, since a static override selector contradicts automatic,
 *  per-turn detection. The field itself stays (defaulting to, and for all
 *  practical purposes now always, `"english"`) purely so a Farmer whose
 *  browser already persisted a real Urdu preference from before that
 *  milestone doesn't silently lose it as this one fallback value.
 * `displayLanguage` (the app's own UI text) has NO real translation catalog
 * yet — this change only establishes the preference/settings architecture
 * for it, and the Settings page says so plainly rather than
 * pretending to translate.
 */

// The Farmer product's LOCKED language set is exactly English and
// Urdu; Punjabi/Sindhi were listed here as inert, unimplemented placeholder
// values (confirmed by audit: neither had any
// real translation catalog entry, STT language mapping, or other wired
// behavior anywhere in the codebase) and are removed from the SELECTABLE
// set per the explicit "do not preserve them as active
// choices" instruction. A Farmer whose browser still has one persisted
// from before this change is never shown it again and never crashes —
// see this store's own `merge` option below, which sanitizes any legacy
// stored value back to `"english"` on load, the same safe default a
// brand-new Farmer already starts with.
export const FARMER_LANGUAGES = ["english", "urdu"] as const;
export type FarmerLanguage = (typeof FARMER_LANGUAGES)[number];

export const FARMER_LANGUAGE_LABELS: Record<FarmerLanguage, string> = {
  english: "English",
  urdu: "Urdu",
};

/** `true` only for the two values this product actually supports today — used by this store's own `merge` option to sanitize a legacy-persisted value, never exported for general "is this a valid language" checks elsewhere (this store is the one place `FarmerLanguage`'s own membership is authoritative). */
function isSupportedFarmerLanguage(value: unknown): value is FarmerLanguage {
  return value === "english" || value === "urdu";
}

export interface FarmerNotificationPreferences {
  cropIssueAlerts: boolean;
  missionCompletion: boolean;
  robotDroneAlerts: boolean;
  weatherAlerts: boolean;
}

// A real, persisted preference,
// same pattern as `displayLanguage` immediately above (client-only,
// localStorage, no backend model). `"light"` is the default so an existing
// Farmer's browser — and a brand-new one — keeps rendering exactly the
// warm neumorphic theme this product has always shown until they
// deliberately opt into dark; this change does not flip anyone into
// dark mode without their own action.
export const FARMER_THEMES = ["light", "dark"] as const;
export type FarmerTheme = (typeof FARMER_THEMES)[number];

function isSupportedFarmerTheme(value: unknown): value is FarmerTheme {
  return value === "light" || value === "dark";
}

interface FarmerSettingsState {
  displayLanguage: FarmerLanguage;
  auraLanguage: FarmerLanguage;
  theme: FarmerTheme;
  actionConfirmationRequired: boolean;
  notifications: FarmerNotificationPreferences;
  setDisplayLanguage: (language: FarmerLanguage) => void;
  setAuraLanguage: (language: FarmerLanguage) => void;
  setTheme: (theme: FarmerTheme) => void;
  setActionConfirmationRequired: (required: boolean) => void;
  setNotificationPreference: (key: keyof FarmerNotificationPreferences, value: boolean) => void;
}

export const useFarmerSettingsStore = create<FarmerSettingsState>()(
  persist(
    (set) => ({
      displayLanguage: "english",
      auraLanguage: "english",
      theme: "light",
      actionConfirmationRequired: true,
      notifications: {
        cropIssueAlerts: true,
        missionCompletion: true,
        robotDroneAlerts: true,
        weatherAlerts: true,
      },
      setDisplayLanguage: (displayLanguage) => set({ displayLanguage }),
      setAuraLanguage: (auraLanguage) => set({ auraLanguage }),
      setTheme: (theme) => set({ theme }),
      setActionConfirmationRequired: (actionConfirmationRequired) => set({ actionConfirmationRequired }),
      setNotificationPreference: (key, value) => set((state) => ({ notifications: { ...state.notifications, [key]: value } })),
    }),
    {
      name: "farmer-settings",
      // Sanitizes a value from a BROWSER's own
      // pre-existing localStorage (e.g. `"punjabi"`/`"sindhi"`, persisted
      // before this change removed them from `FarmerLanguage`) back to
      // the same safe `"english"` default a brand-new Farmer already
      // starts with, rather than letting an unsupported string silently
      // flow into state where `FARMER_LANGUAGE_LABELS`/the Select's own
      // option list no longer has a matching entry for it. Every other
      // persisted field passes through unchanged. MVP-UI.1-F extends the
      // same sanitization to `theme`, for the same reason.
      merge: (persistedState, currentState) => {
        const merged = { ...currentState, ...(persistedState as Partial<FarmerSettingsState>) };
        if (!isSupportedFarmerLanguage(merged.displayLanguage)) merged.displayLanguage = "english";
        if (!isSupportedFarmerLanguage(merged.auraLanguage)) merged.auraLanguage = "english";
        if (!isSupportedFarmerTheme(merged.theme)) merged.theme = "light";
        return merged;
      },
    },
  ),
);
