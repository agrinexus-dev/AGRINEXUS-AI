"use client";

import { useFarmerSettingsStore } from "@/lib/farmer/farmer-settings-store";

import { FARMER_TEXT_EN } from "./en";
import { FARMER_TEXT_UR } from "./ur";

/**
 * The one hook every
 * Farmer-facing component uses to render UI text, built on the EXISTING
 * `displayLanguage` state (`farmer-settings-store.ts`) — no second/competing
 * language store is introduced, per this change's explicit instruction.
 *
 * `displayLanguage` is client-only (Zustand + localStorage, no server-
 * readable cookie — see that store's own doc comment). This means a
 * Server-Component page (e.g. the Farmer Dashboard) cannot know the
 * Farmer's language choice at render time; the pragmatic, minimal-change
 * answer used throughout this change is a tiny CLIENT component (`
 * FarmerT`, below) that reads this hook and swaps in the translated string
 * after hydration — the page's own data-fetching stays a Server Component,
 * untouched. The disclosed, honest limitation: a Farmer who has Urdu
 * selected sees a brief English flash on first paint before hydration
 * swaps the translated strings in (see the milestone report's own
 * Limitations section).
 *
 * Punjabi/Sindhi are explicitly OUT of scope for this change (per its
 * own "do not introduce Punjabi/Sindhi implementation yet" rule) even
 * though `FarmerLanguage` already lists them — both fall back to English
 * here, the same safe fall-back-to-English default `communicationStyleFor`
 * (`prompt-builder.ts`) already uses for an unrecognized role.
 */
export type FarmerTranslationKey = keyof typeof FARMER_TEXT_EN;

export interface FarmerTranslation {
  /** Looks up `key` in the Farmer's chosen `displayLanguage` catalog, falling back to English for any key a non-English catalog hasn't got (never happens today — `ur.ts` is typechecked to carry every key — but keeps this function safe if that ever changes). */
  t: (key: FarmerTranslationKey) => string;
  /** `true` only for Urdu — the one language this change actually implements RTL/translation for. */
  isRTL: boolean;
  /** `"rtl"` for Urdu, `"ltr"` for everything else — pass directly to a `dir` attribute. */
  dir: "ltr" | "rtl";
}

export function useFarmerTranslation(): FarmerTranslation {
  const displayLanguage = useFarmerSettingsStore((state) => state.displayLanguage);
  const isUrdu = displayLanguage === "urdu";
  const catalog = isUrdu ? FARMER_TEXT_UR : FARMER_TEXT_EN;

  function t(key: FarmerTranslationKey): string {
    return catalog[key] ?? FARMER_TEXT_EN[key];
  }

  return { t, isRTL: isUrdu, dir: isUrdu ? "rtl" : "ltr" };
}
