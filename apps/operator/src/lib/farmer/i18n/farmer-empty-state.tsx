"use client";

import type { ReactNode } from "react";

import { EmptyState } from "@agrinexus/ui";

import type { FarmerTranslationKey } from "./use-farmer-translation";
import { useFarmerTranslation } from "./use-farmer-translation";

/**
 * `@agrinexus/ui`'s
 * `EmptyState` types `title`/`description` as plain `string` (a shared
 * component used across the whole app, deliberately NOT modified by this
 * Farmer-only milestone — see the "do not modify unrelated
 * Operator systems" rule). This wrapper resolves the translated strings
 * client-side (inside a Server-Component page — the Farmer Dashboard — the
 * same reason `FarmerT` exists) and hands `EmptyState` plain, already-
 * resolved strings, exactly the shape it already expects.
 */
export function FarmerEmptyState({
  icon,
  titleKey,
  descriptionKey,
}: {
  icon?: ReactNode;
  titleKey: FarmerTranslationKey;
  descriptionKey?: FarmerTranslationKey;
}) {
  const { t } = useFarmerTranslation();
  return <EmptyState icon={icon} title={t(titleKey)} description={descriptionKey ? t(descriptionKey) : undefined} />;
}
