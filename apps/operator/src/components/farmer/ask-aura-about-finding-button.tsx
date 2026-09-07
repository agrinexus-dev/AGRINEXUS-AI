"use client";

import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { Button } from "@agrinexus/ui";

import { useLiveContextStore } from "@/lib/aura/context/live-context-store";
import { useFarmerTranslation } from "@/lib/farmer/i18n/use-farmer-translation";

export interface AskAuraAboutFindingButtonProps {
  /** The real, persisted `CropFinding.id` this alert is linked to (never a fabricated/parsed id). */
  findingId: string;
  /** The finding's real plot label (`alert.findingPlotLabel`), matching the exact `label` shape `digital-twin-page.tsx`'s own `?focusFinding` handler already builds. */
  plotLabel: string;
  /** The finding's real description — for a finding-linked alert this IS the finding's own `description` (`findings-service.ts`'s `createFinding` sets `alert.message` to `input.description` verbatim), never invented text. */
  description: string;
}

/**
 * Reuses,
 * byte-for-byte, the EXISTING "Ask AURA about this" mechanism
 * `digital-twin/ui/details-panel.tsx`'s `handleAskAuraAboutFinding` already
 * implements for the Farmer section:
 *
 *  1. Publish the real finding into AURA's Context Engine
 *  (`useLiveContextStore.publishDigitalTwinContext`) — the SAME store
 *  field (`digitalTwin.selectedEntity`) `digital-twin-page.tsx` itself
 *  publishes into whenever a 3D marker or the `?focusFinding=` URL
 *  param selects a finding there (see that file's own effect). This is
 *  a public, already-exported store action — not a new context shape.
 *  2. Navigate to `/farmer/aura?ask=1`, which `farmer-aura-page.tsx`
 *  already handles by sending its own existing fixed starter question
 *  ("What's wrong with this issue, and can it be handled
 *  automatically?") once mounted — unchanged, no new AURA logic, no
 *  new endpoint, no generated text.
 *
 * The ONLY thing new here is WHERE the selection is published from (the
 * Dashboard's Attention row, instead of a 3D marker click — the
 * consuming mechanism (Context Engine → AURA prompt) is completely
 * unmodified. Restricted to finding-linked alerts specifically because
 * that fixed starter question ("this issue... handled automatically")
 * only makes sense for a crop finding, matching the exact scope
 * `details-panel.tsx`/`alerts-page.tsx`'s own `isFindingAlert` gate
 * already uses — never applied to a sensor-only alert (see
 * `farmer/page.tsx`'s own call site for the non-finding fallback).
 */
export function AskAuraAboutFindingButton({ findingId, plotLabel, description }: AskAuraAboutFindingButtonProps) {
  const { t } = useFarmerTranslation();
  const router = useRouter();
  const publishDigitalTwinContext = useLiveContextStore((state) => state.publishDigitalTwinContext);

  function handleClick() {
    publishDigitalTwinContext({ selectedEntity: { id: findingId, type: "finding", label: plotLabel, meta: description } });
    router.push("/farmer/aura?ask=1");
  }

  return (
    <Button intent="ghost" size="sm" className="gap-1.5" onClick={handleClick}>
      <Sparkles className="size-3.5" aria-hidden />
      {t("dashboard.askAuraCardTitle")}
    </Button>
  );
}
