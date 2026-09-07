"use client";

import { Radar } from "lucide-react";

import { Card, Switch, Typography } from "@agrinexus/ui";

import { setDroneAutonomousEnabled, setRobotAutonomousEnabled } from "@/lib/autonomous/autonomous-behavior";
import { useDroneAutonomousEnabled } from "@/lib/fleet/fleet-store";
import { useRobotAutonomousEnabled } from "@/lib/robots/robot-store";

/**
 * The explicit, always-visible control for the global
 * autonomous-behavior toggle. Rendered once on each Mission Planner (this
 * exact component, parameterized by `vehicleKind`, keeps the Drone and
 * Robot planners' controls a single shared implementation while still
 * satisfying "Drone and robot controls MUST be separate" — each planner
 * shows only its own vehicle kind's switch, and the two flags
 * (`useFleetStore`'s vs `useRobotStore`'s own `autonomousEnabled`) are
 * completely independent state, never one combined switch.
 *
 * This is the ONE place that actually flips the flag — it calls
 * `setDroneAutonomousEnabled`/`setRobotAutonomousEnabled`
 * (`lib/autonomous/autonomous-behavior.ts`), never the store's raw setter
 * directly, so the toggle takes visible effect immediately instead of
 * waiting for the periodic scheduler tick. AURA's own
 * enable/disable-autonomous commands call the exact same two
 * functions — this UI is the primary control Part 13 asks for, not the
 * only one.
 */
export function AutonomousBehaviorToggle({ vehicleKind }: { vehicleKind: "drone" | "robot" }) {
  const droneEnabled = useDroneAutonomousEnabled();
  const robotEnabled = useRobotAutonomousEnabled();
  const enabled = vehicleKind === "drone" ? droneEnabled : robotEnabled;
  const label = vehicleKind === "drone" ? "Drone" : "Robot";

  function handleChange(next: boolean) {
    if (vehicleKind === "drone") setDroneAutonomousEnabled(next);
    else setRobotAutonomousEnabled(next);
  }

  return (
    <Card className="flex items-center justify-between gap-3 p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Typography variant="small" className="flex items-center gap-1.5 font-medium text-foreground">
          <Radar className="size-3.5 shrink-0" aria-hidden />
          Autonomous Behavior — {label}
        </Typography>
        <Typography variant="caption" className="text-foreground-subtle">
          {enabled
            ? `${label} patrols the farm on its own whenever it has no mission.`
            : `${label} stays home/idle whenever it has no mission.`}
        </Typography>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Typography variant="caption" className={enabled ? "font-semibold text-accent" : "text-foreground-subtle"}>
          {enabled ? "ON" : "OFF"}
        </Typography>
        <Switch checked={enabled} onCheckedChange={handleChange} aria-label={`${label} autonomous behavior`} />
      </div>
    </Card>
  );
}
