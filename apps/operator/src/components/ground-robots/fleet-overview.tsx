"use client";

import { motion } from "framer-motion";

import { KpiCard } from "@agrinexus/ui";

import { fadeUp, staggerContainer } from "@/components/command-center/motion";
import type { RobotRecord } from "@/lib/robots/types";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * Fleet Overview — was a single sidebar `Card` with stacked
 * rows; rebuilt as a `KpiCard` row to match `FleetKpiRow`'s exact structure
 * (Drone Fleet is the reference convention this change aligns to). Every
 * count is still derived straight from `useRobots()` (the Robot Store) — no
 * separate mock summary, unchanged from before. Metrics stay
 * robot-appropriate rather than a blind copy of the drone KPIs: "Active Now"
 * covers every moving robot status (active/on-mission/returning — mirrors
 * `FleetKpiRow`'s "Airborne Now" concept for the ground-vehicle equivalent),
 * and "Needs Attention" uses the same `health !== "nominal"` rule
 * `FleetKpiRow` already uses (both fleets share the same `HealthStatus`
 * vocabulary).
 */
export function FleetOverview({ robots }: { robots: RobotRecord[] }) {
  const total = robots.length;
  const active = robots.filter((robot) => robot.status === "active" || robot.status === "on-mission" || robot.status === "returning").length;
  const avgBattery = average(robots.map((robot) => robot.batteryPercent));
  const needsAttention = robots.filter((robot) => robot.health !== "nominal").length;

  return (
    <motion.div variants={staggerContainer} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <motion.div variants={fadeUp}>
        <KpiCard label="Total Robots" value={total} />
      </motion.div>
      <motion.div variants={fadeUp}>
        <KpiCard label="Active Now" value={`${active}/${total}`} />
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
