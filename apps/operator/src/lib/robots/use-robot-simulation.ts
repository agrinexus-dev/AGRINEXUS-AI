"use client";

import { useEffect } from "react";

import { useRobotStore } from "./robot-store";

const TICK_MS = 1000;
const BATTERY_DRAIN_PERCENT_PER_MIN = 0.6;
const BATTERY_CHARGE_PERCENT_PER_MIN = 4;

/**
 * Keeps every ground robot's simulated state progressing —
 * mirrors `lib/missions/use-mission-simulation.ts`'s shape and its
 * time-based "arrive and stop" technique (see that hook's own doc comment
 * for the underlying gap: `advanceRouteCursor` has no arrive-and-stop
 * semantics, so an external, independent ticker decides when a "Send Home"
 * trip ends rather than relying on the looping route itself).
 *
 * Two responsibilities, both pure Robot Store reads/writes — no R3F refs,
 * no dependency on the Digital Twin being mounted at all (a robot dispatched
 * from the Ground Robots page keeps "traveling" home even if nobody has the
 * 3D viewport open):
 *  - Battery drains while a robot is out (active/on-mission), recharges
 *  while charging — never touched while paused/idle/maintenance/offline.
 *  - A "returning" robot flips to "charging" once its estimated ETA passes.
 */
export function useRobotSimulation(): void {
  useEffect(() => {
    function tick() {
      const { order, robots } = useRobotStore.getState();
      const deltaMinutes = TICK_MS / 1000 / 60;

      for (const id of order) {
        const robot = robots[id];
        if (!robot) continue;

        if (robot.status === "returning" && robot.returningEtaAt !== null && Date.now() >= robot.returningEtaAt) {
          useRobotStore.getState().markArrivedHome(id);
        }

        if (robot.status === "active" || robot.status === "on-mission" || robot.status === "returning") {
          const next = Math.max(5, Math.round((robot.batteryPercent - BATTERY_DRAIN_PERCENT_PER_MIN * deltaMinutes) * 10) / 10);
          if (next !== robot.batteryPercent) useRobotStore.getState().updateRobotTelemetry(id, { batteryPercent: next });
        } else if (robot.status === "charging") {
          const next = Math.min(100, Math.round((robot.batteryPercent + BATTERY_CHARGE_PERCENT_PER_MIN * deltaMinutes) * 10) / 10);
          if (next !== robot.batteryPercent) useRobotStore.getState().updateRobotTelemetry(id, { batteryPercent: next });
        }
      }
    }

    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, []);
}
