"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

import { SectionHeader, Typography } from "@agrinexus/ui";

import { fadeUp, staggerContainer } from "@/components/command-center/motion";
import { useAutonomousBehaviorScheduler } from "@/lib/autonomous/autonomous-behavior";
import { useFleetDrones, useFleetHydration, useFleetStore } from "@/lib/fleet/fleet-store";

import { AddDroneDialog } from "./add-drone-dialog";
import { DroneDetailsPanel } from "./drone-details-panel";
import { DroneTable } from "./drone-table";
import { FleetHealthWidget } from "./fleet-health-widget";
import { FleetKpiRow } from "./fleet-kpi-row";
import { FleetMapPlaceholder } from "./fleet-map-placeholder";
import { MaintenanceOverview } from "./maintenance-overview";
import { MissionQueueWidget } from "./mission-queue-widget";
import { QuickActions } from "./quick-actions";
import { TelemetryCards } from "./telemetry-cards";

/**
 * The Drone Fleet Command Center — every section here reads
 * from `useFleetDrones()`, the same Fleet Store the Digital Twin and AURA
 * consume. There is no separate mock data source: add or remove a drone
 * here and the Digital Twin/AURA see it on their next render, with no page
 * refresh, because they all subscribe to the same store.
 */
export function DroneFleetPage() {
  const drones = useFleetDrones();
  const { status: hydrationStatus, error: hydrationError } = useFleetHydration();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Same mounted-page-scoped lifecycle every other
  // ticker in this app uses (see `useAutonomousBehaviorScheduler`'s own
  // doc comment). Mounted here too (not just the Mission Planner/Digital
  // Twin) so a drone whose mission completes/recurring schedule frees it up
  // while the operator is looking at THIS page still gets promptly
  // reconciled to autonomous patrol (if enabled) rather than sitting
  // statically at "Idle" until some other page happens to be visited.
  useAutonomousBehaviorScheduler();

  // Loads whatever's durable in Postgres beyond Drone Alpha's already-seeded
  // local record — one-time on mount, merge-by-id, never a
  // polling loop (drones don't get added/removed on their own).
  useEffect(() => {
    void useFleetStore.getState().fetchDrones();
  }, []);

  const handleRemove = useCallback((id: string) => {
    useFleetStore
      .getState()
      .removeDrone(id)
      .catch(() => {
        // Best-effort — the table/details panel simply keeps showing the
        // drone if the delete failed server-side, same fail-open UX
        // `removeSensor`'s callers already accept.
      });
    setSelectedId((current) => (current === id ? null : current));
  }, []);

  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="flex flex-col gap-6 pb-20">
      <SectionHeader
        title="Drone Fleet"
        description="Every drone in the fleet, live — the same data the Digital Twin and AURA see."
      />

      {hydrationStatus === "error" ? (
        <Typography variant="small" className="text-critical" role="alert">
          Couldn&apos;t load saved drones: {hydrationError}
        </Typography>
      ) : null}

      <motion.div variants={fadeUp}>
        <FleetKpiRow drones={drones} />
      </motion.div>

      <motion.div variants={fadeUp}>
        <QuickActions onAddDrone={() => setAddOpen(true)} />
      </motion.div>

      <motion.div variants={fadeUp}>
        <DroneTable drones={drones} onSelect={setSelectedId} onRemove={handleRemove} />
      </motion.div>

      <motion.div variants={fadeUp}>
        <TelemetryCards drones={drones} />
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FleetHealthWidget drones={drones} />
        <MissionQueueWidget drones={drones} />
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MaintenanceOverview drones={drones} />
        <FleetMapPlaceholder />
      </motion.div>

      <AddDroneDialog open={addOpen} onOpenChange={setAddOpen} />
      <DroneDetailsPanel droneId={selectedId} onClose={() => setSelectedId(null)} />
    </motion.div>
  );
}
