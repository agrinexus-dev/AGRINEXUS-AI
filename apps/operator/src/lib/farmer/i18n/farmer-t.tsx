"use client";

import type { FarmerTranslationKey } from "./use-farmer-translation";
import { useFarmerTranslation } from "./use-farmer-translation";

/**
 * A minimal client "translation leaf" for use inside a
 * Server Component page (the Farmer Dashboard, `app/farmer/page.tsx`, is a
 * Server Component reading real Prisma data directly — see that file's own
 * doc comment on why it stays that way). Wrapping just the static text
 * nodes in this tiny client component, rather than converting the whole
 * page to a Client Component, keeps the page's real farm-data fetching
 * exactly as it was — this component renders NOTHING but a translated
 * string.
 */
export function FarmerT({ k }: { k: FarmerTranslationKey }) {
  const { t } = useFarmerTranslation();
  return <>{t(k)}</>;
}
