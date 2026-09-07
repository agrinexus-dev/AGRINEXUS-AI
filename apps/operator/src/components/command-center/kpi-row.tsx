"use client";

import { motion } from "framer-motion";

import { KpiCard, type KpiCardProps } from "@agrinexus/ui";

import { fadeUp, staggerContainer } from "./motion";

/** Exported so AURA's Context Engine can read the same values the dashboard renders, instead of duplicating them (see lib/aura/context/collect-context.ts). */
export const kpis: KpiCardProps[] = [
  { label: "Farm Health", value: "94%", delta: "+2%", deltaDirection: "up", period: "vs last week" },
  { label: "Fleet Readiness", value: "8/10", delta: "Ready", deltaDirection: "flat" },
  { label: "Critical Alerts", value: "1", delta: "-2", deltaDirection: "down", period: "vs yesterday" },
  { label: "AI Confidence", value: "97%", delta: "+1%", deltaDirection: "up", period: "vs last week" },
];

export function KpiRow() {
  return (
    <motion.div variants={staggerContainer} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <motion.div key={kpi.label} variants={fadeUp}>
          <KpiCard {...kpi} />
        </motion.div>
      ))}
    </motion.div>
  );
}
