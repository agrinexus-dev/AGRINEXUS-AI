"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

import { SectionHeader, Typography } from "@agrinexus/ui";

import { fadeUp, staggerContainer } from "@/components/command-center/motion";
import { useAutonomousBehaviorScheduler } from "@/lib/autonomous/autonomous-behavior";
import { useRobotHydration, useRobots, useRobotStore } from "@/lib/robots/robot-store";
import { useRobotSimulation } from "@/lib/robots/use-robot-simulation";

import { AddRobotDialog } from "./add-robot-dialog";
import { FleetOverview } from "./fleet-overview";
import { QuickActions } from "./quick-actions";
import { RobotDetailsPanel } from "./robot-details-panel";
import { RobotTable } from "./robot-table";

/**
 * The Ground Robot Fleet Command Center (layout aligned to
 * `DroneFleetPage`'s conventions — same section order:
 * header, hydration error, QuickActions, a KpiCard row, a full-width table,
 * a Drawer-based details panel opened by selection rather than a permanent
 * third grid column). Every section here still reads from `useRobots()`
 * (the Robot Store), the same store the Digital Twin and AURA consume, so
 * adding/removing/dispatching a robot here is visible everywhere else on
 * the very next render — unchanged from before.
 */
export function GroundRobotsPage() {
  const robots = useRobots();
  const { status: hydrationStatus, error: hydrationError } = useRobotHydration();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keeps every robot's battery/ETA progressing while this page is open —
  // same mounted-page-scoped lifecycle `useMissionSimulation` already has on
  // the Digital Twin and Mission Planner pages.
  useRobotSimulation();
  // Mirrors `DroneFleetPage`'s own addition; see that
  // file's doc comment for why this page (not just the Mission Planner/
  // Digital Twin) also needs it mounted.
  useAutonomousBehaviorScheduler();

  // Loads whatever's durable in Postgres beyond Robot Bravo's already-seeded
  // local record — one-time on mount, merge-by-id, mirrors
  // `DroneFleetPage`'s own `fetchDrones()` effect exactly.
  useEffect(() => {
    void useRobotStore.getState().fetchRobots();
  }, []);

  // Mirrors `DroneFleetPage`'s `handleRemove` exactly,
  // including its fail-open UX: `removeRobot` is now a real, persisted
  // `DELETE /api/robots/:id` round-trip (see `robot-store.ts`); on failure
  // the promise rejection is swallowed here the SAME way `DroneFleetPage`
  // already swallows `removeDrone`'s — the robot simply stays in the table
  // (never a false "deleted" claim), matching the established Drone Fleet
  // deletion convention this change is asked to follow.
  const handleRemove = useCallback((id: string) => {
    useRobotStore
      .getState()
      .removeRobot(id)
      .catch(() => {
        // Best-effort — see doc comment above.
      });
    setSelectedId((current) => (current === id ? null : current));
  }, []);

  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="flex flex-col gap-6 pb-20">
      <SectionHeader
        title="Ground Robot Fleet"
        description="Every ground robot in the fleet, live — the same data the Digital Twin and AURA see."
      />

      {hydrationStatus === "error" ? (
        <Typography variant="small" className="text-critical" role="alert">
          Couldn&apos;t load saved robots: {hydrationError}
        </Typography>
      ) : null}

      <motion.div variants={fadeUp}>
        <QuickActions onAddRobot={() => setAddOpen(true)} />
      </motion.div>

      <motion.div variants={fadeUp}>
        <FleetOverview robots={robots} />
      </motion.div>

      <motion.div variants={fadeUp}>
        <RobotTable robots={robots} selectedId={selectedId} onSelect={setSelectedId} onRemove={handleRemove} />
      </motion.div>

      <AddRobotDialog open={addOpen} onOpenChange={setAddOpen} />
      <RobotDetailsPanel robotId={selectedId} onClose={() => setSelectedId(null)} />
    </motion.div>
  );
}
