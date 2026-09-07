"use client";

import { motion } from "framer-motion";

import { FullscreenOverlay } from "@/components/workspace/fullscreen-overlay";
import { WorkspaceGrid } from "@/components/workspace/workspace-grid";
import { AdaptiveWorkspaceProvider } from "@/lib/workspace/workspace-context";

import { AuraMissionControlActionBridge } from "./aura-mission-control-action-bridge";
import { AuraMissionControlContextPublisher } from "./aura-mission-control-context-publisher";
import { CommandCenterToolbar } from "./command-center-toolbar";
import { FloatingDock } from "./floating-dock";
import { GreetingSection } from "./greeting-section";
import { KpiRow } from "./kpi-row";
import { MissionStatusBanner } from "./mission-status-banner";
import { fadeUp, staggerContainer } from "./motion";
import { QuickActions } from "./quick-actions";

/**
 * The AgriNexus Command Center: the platform's central operating workspace.
 * Page-level chrome only (greeting, status, KPIs, quick actions, toolbar,
 * dock) — the widget grid itself is entirely owned by the existing Adaptive
 * Workspace Engine (drag/resize/collapse/fullscreen/presentation-mode all
 * come from there, unmodified).
 */
export function CommandCenterPage() {
  return (
    <AdaptiveWorkspaceProvider>
      <AuraMissionControlContextPublisher />
      <AuraMissionControlActionBridge />
      <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="flex flex-col gap-6 pb-20">
        <GreetingSection />
        <MissionStatusBanner />
        <KpiRow />
        <QuickActions />
        <CommandCenterToolbar />
        <motion.div variants={fadeUp}>
          <WorkspaceGrid />
        </motion.div>
      </motion.div>

      <FullscreenOverlay />
      <FloatingDock />
    </AdaptiveWorkspaceProvider>
  );
}
