"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { SectionHeader, Typography } from "@agrinexus/ui";

import { fadeUp, staggerContainer } from "@/components/command-center/motion";
import { useSensorHydration, useSensors, useSensorStore, useSensorTelemetrySync } from "@/lib/sensors/sensor-store";
import { useSensorSimulation } from "@/lib/sensors/use-sensor-simulation";

import { AddSensorDialog } from "./add-sensor-dialog";
import { QuickActions } from "./quick-actions";
import { SensorDetailsPanel } from "./sensor-details-panel";
import { SensorOverview } from "./sensor-overview";
import { SensorTable } from "./sensor-table";

/**
 * The Smart Sensor Network Center — mirrors `GroundRobotsPage`
 * / `DroneFleetPage`'s relationship to their own stores exactly: every
 * section here reads from `useSensors()` (the Sensor Store), the same store
 * the Digital Twin and AURA consume.
 *
 * Backend-backed: `fetchSensors()` loads whatever's
 * durably persisted for this farm on mount (merged into the same store the
 * simulation already populates — see that store's own doc comment), and
 * `useSensorTelemetrySync()` periodically persists the live simulation's
 * current state back to Postgres. Neither changes this page's layout.
 */
export function SensorNetworkPage() {
  const sensors = useSensors();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { status: hydration, error: hydrationError } = useSensorHydration();

  // Keeps every sensor's reading/battery/signal drifting while this page is
  // open — same mounted-page-scoped lifecycle every other simulation hook uses.
  useSensorSimulation();
  useSensorTelemetrySync();

  useEffect(() => {
    void useSensorStore.getState().fetchSensors();
  }, []);

  const selectedSensor = sensors.find((sensor) => sensor.id === selectedId) ?? null;

  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="flex flex-col gap-6 pb-20">
      <SectionHeader
        title="Smart Sensor Network"
        description="Every sensor in the network, live — the same data the Digital Twin and AURA see."
      />

      {hydration === "error" ? (
        <div className="flex items-center gap-2 rounded-lg border border-critical/40 bg-critical-muted px-3 py-2">
          <TriangleAlert className="size-4 shrink-0 text-critical" aria-hidden />
          <Typography variant="small" className="text-critical">
            Couldn&apos;t load saved sensors from the server: {hydrationError}. Sensors created this session are still shown below.
          </Typography>
        </div>
      ) : null}

      <motion.div variants={fadeUp}>
        <QuickActions onAddSensor={() => setAddOpen(true)} />
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_320px]">
        <SensorOverview sensors={sensors} />
        <SensorTable sensors={sensors} selectedId={selectedId} onSelect={setSelectedId} />
        <SensorDetailsPanel sensor={selectedSensor} />
      </motion.div>

      <AddSensorDialog open={addOpen} onOpenChange={setAddOpen} />
    </motion.div>
  );
}
