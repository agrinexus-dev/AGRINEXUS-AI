"use client";

import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

import { Panel, StatusBadge, Typography } from "@agrinexus/ui";

import { fadeUp } from "./motion";

/** Exported so AURA's Context Engine can read the same status text the banner renders, instead of duplicating it. */
export const MISSION_STATUS_TEXT = "All Systems Operational";

export function MissionStatusBanner() {
  return (
    <motion.div variants={fadeUp}>
      <Panel variant="subtle" padding="sm" className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="size-4 text-success" aria-hidden="true" />
          <Typography variant="small" className="text-foreground">
            {MISSION_STATUS_TEXT}
          </Typography>
        </div>
        <StatusBadge status="nominal" />
      </Panel>
    </motion.div>
  );
}
