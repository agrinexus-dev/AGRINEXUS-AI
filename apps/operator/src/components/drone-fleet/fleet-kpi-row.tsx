"use client";

import { motion } from "framer-motion";

import { KpiCard } from "@agrinexus/ui";

import { fadeUp, staggerContainer } from "@/components/command-center/motion";
import type { DroneRecord } from "@/lib/fleet/types";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function FleetKpiRow({ drones }: { drones: DroneRecord[] }) {
  const total = drones.length;
  // "on-mission" (the real status a flying drone gets;
  // see `use-mission-simulation.ts`) was missing here even before this
  // phase, which combined with "patrolling" no longer being assigned by
  // default would otherwise make this KPI permanently read 0. "patrolling"
  // is kept in this check defensively (never assigned by default anymore,
  // but not removed from `DroneStatus` either — see `fleet/types.ts`).
  const airborne = drones.filter((drone) => drone.status === "on-mission" || drone.status === "returning" || drone.status === "patrolling").length;
  const avgBattery = average(drones.map((drone) => drone.batteryPercent));
  const needsAttention = drones.filter((drone) => drone.health !== "nominal").length;

  return (
    <motion.div variants={staggerContainer} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <motion.div variants={fadeUp}>
        <KpiCard label="Total Drones" value={total} />
      </motion.div>
      <motion.div variants={fadeUp}>
        <KpiCard label="Airborne Now" value={`${airborne}/${total}`} />
      </motion.div>
      <motion.div variants={fadeUp}>
        <KpiCard label="Fleet Avg Battery" value={`${avgBattery}%`} />
      </motion.div>
      <motion.div variants={fadeUp}>
        <KpiCard
          label="Needs Attention"
          value={needsAttention}
          delta={needsAttention > 0 ? "Review fleet health" : "All nominal"}
          deltaDirection={needsAttention > 0 ? "down" : "flat"}
        />
      </motion.div>
    </motion.div>
  );
}
