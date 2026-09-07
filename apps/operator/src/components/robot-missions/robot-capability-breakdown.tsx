"use client";

import { Typography } from "@agrinexus/ui";

import type { RobotMissionCapability } from "@/lib/robot-missions/robot-mission-capabilities";

/**
 * The explicit "Detects / Can Resolve / Robot Action"
 * breakdown an operator should see BEFORE launching a robot mission,
 * rather than inferring it from a single flowing sentence (the
 * `description`/`solutionSteps`, which remain unchanged and still used
 * elsewhere — this is an ADDITIONAL, clearer presentation of the exact
 * same `RobotMissionCapability` data, not a second source of truth).
 * Shared by both the one-time Create Robot Mission dialog and the
 * Recurring Missions panel's robot form.
 */
export function RobotCapabilityBreakdown({ capability }: { capability: RobotMissionCapability }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-elevated/50 p-2.5">
      <BreakdownRow label="Detects" items={capability.detects} />
      <BreakdownRow label="Can Resolve" items={capability.canResolve} />
      <BreakdownRow label={capability.robotActions.length > 1 ? "Robot Actions" : "Robot Action"} items={capability.robotActions} />
    </div>
  );
}

function BreakdownRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Typography variant="caption" className="font-semibold tracking-wide text-foreground-subtle uppercase">
        {label}
      </Typography>
      <ul className="flex flex-col gap-0.5 pl-4">
        {items.map((item) => (
          <li key={item} className="list-disc text-xs text-foreground marker:text-foreground-subtle">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
