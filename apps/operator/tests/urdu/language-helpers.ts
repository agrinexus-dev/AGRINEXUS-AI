import type { Page } from "@playwright/test";

import { secureGoto } from "../security/localhost-policy";

/**
 * Real,
 * UI-driven language switching through the actual Settings page
 * (`farmer-settings-page.tsx`), never by writing to `localStorage`
 * directly. `displayLanguage`/`auraLanguage` are Radix `Select` comboboxes
 * with no native `<label for>` association (confirmed by reading that
 * component's source before writing this helper).
 *
 * Located by PAGE ORDER (the "Language" card's combobox always renders
 * before the "AURA" card's — confirmed from `farmer-settings-page.tsx`'s
 * own JSX order), deliberately not by the row's own label text: that text
 * itself flips to Urdu once `displayLanguage` is already Urdu (e.g. "App
 * language" → "ایپ کی زبان"), which would break a text-based locator when
 * testing the Urdu→English direction. The OPTION text inside the opened
 * listbox is always the plain English language name regardless of current
 * UI language — confirmed from `FARMER_LANGUAGE_LABELS`, a fixed,
 * never-translated map (`{ urdu: "Urdu", english: "English",... }`) — so
 * `getByRole("option", { name: language })` is safe unconditionally.
 */
export async function setDisplayLanguage(page: Page, language: "English" | "Urdu"): Promise<void> {
  await secureGoto(page, "http://localhost:3000/farmer/settings");
  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: language, exact: true }).click();
}

// `setAuraLanguage` (the "AURA reply language"
// combobox helper) was removed here, not left dead: that selector no
// longer exists in the Farmer Settings UI at all (AURA now detects
// conversation language automatically, per turn, from the message itself —
// see `farmer-settings-page.tsx`'s own doc comment on the removal). Every
// caller that used to force it has been updated to rely on the automatic
// detector instead (`aura-behavior.spec.ts`).
