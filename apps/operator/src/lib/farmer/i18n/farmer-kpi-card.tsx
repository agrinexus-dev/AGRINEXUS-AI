"use client";

import { KpiCard } from "@agrinexus/ui";

import type { FarmerTranslationKey } from "./use-farmer-translation";
import { useFarmerTranslation } from "./use-farmer-translation";

/**
 * Same pattern as
 * `FarmerEmptyState`: `@agrinexus/ui`'s `KpiCard` types `label` as a plain
 * `string` (shared, unmodified by this change), so this wrapper resolves
 * the translated label client-side before handing it down, letting the
 * Farmer Dashboard (a Server Component reading real Prisma data — see that
 * page's own doc comment) stay untouched otherwise.
 */
export function FarmerKpiCard({ labelKey, value }: { labelKey: FarmerTranslationKey; value: string | number }) {
  const { t } = useFarmerTranslation();
  return <KpiCard label={t(labelKey)} value={value} />;
}
