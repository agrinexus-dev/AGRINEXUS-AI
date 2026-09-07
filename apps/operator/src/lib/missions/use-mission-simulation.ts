"use client";

import { useEffect } from "react";

import { useFleetStore } from "@/lib/fleet/fleet-store";
import { useFindingStore } from "@/lib/findings/finding-store";
import { DRONE_SCAN_RADIUS_M, generatePlotIssueCandidates, withinScanRadius } from "@/lib/findings/issue-generator";
import { getPlotById } from "@/lib/plots/plot-store";

import { computeRouteDistances, interpolatePositionAtDistance, waypointIndexForDistance } from "./mission-defaults";
import { useMissionStore } from "./mission-store";
import { derivePhaseFromProgress, missionRoute, MISSION_FLIGHT_STATUSES } from "./types";

/**
 * The drone "scanning" its target plot as it
 * flies the EXISTING generated survey path, purely additive to the tick
 * loop below: never touches `progressPercent`/`status`/completion timing,
 * only reads the same `traveledDistance` the progress calculation already
 * computed and (idempotently, via the Finding Store's own duplicate guard)
 * records any candidate issue the drone has now come within scan range of.
 * Manual-flight missions are skipped — there's no automated survey pattern
 * to "scan" during a human-flown mission.
 */
function scanForIssues(
  mission: { id: string; name: string; missionType: string; targetPlotId: string | null },
  waypoints: { position: [number, number] }[],
  cumulativeDistances: number[],
  traveledDistance: number,
): void {
  if (mission.missionType === "manual" || !mission.targetPlotId) return;
  const plot = getPlotById(mission.targetPlotId);
  if (!plot) return;

  const vehiclePosition = interpolatePositionAtDistance(waypoints, cumulativeDistances, traveledDistance);
  const candidates = generatePlotIssueCandidates(mission.id, plot.id, plot.label, plot.center, plot.size);

  for (const candidate of candidates) {
    if (!withinScanRadius(vehiclePosition, candidate.position, DRONE_SCAN_RADIUS_M)) continue;
    useFindingStore.getState().recordDetection({
      candidate,
      plotId: plot.id,
      plotLabel: plot.label,
      missionId: mission.id,
      missionName: mission.name,
      vehicle: "drone",
    });
  }
}

const TICK_MS = 1000;
// There's no backend yet, so a mission's ESTIMATED duration
// (often several real minutes) is compressed into a demoable timeframe
// rather than making an operator actually wait that long to see a mission
// progress and complete — an explicit, documented simulation-speed choice,
// not a hidden shortcut. The estimate itself (shown in the Mission
// Inspector) is never altered by this; only how fast simulated time passes.
//
// This factor now has to apply to the SAME quantity on
// both sides of the simulation — real distance traveled — not
// independently to this tick's time-based progress formula while the
// Digital Twin's visual flight (`systems/drone.tsx`) kept moving the drone
// at real, unaccelerated speed. That mismatch was the root cause of
// missions completing after the drone had covered only a small fraction of
// the generated path: this tick's old progress clock finished 12x faster
// than the drone could actually fly the real path length. Exported so
// `systems/drone.tsx` can apply the exact same multiplier to the drone's
// visual speed while it's actively flying a mission — one shared factor
// applied to one shared notion of distance, instead of two independently
// -computed clocks that could drift apart.
//
// Lowered from 12 to 4. Live-measured real-world completion
// times at 12x ranged roughly 4–25 real seconds depending on route length —
// too fast for a farmer to actually observe Preparing → Surveying →
// Returning → Completed as a real lifecycle. At 4x, live end-to-end runs
// against real farm plots (20×20 real plot size, not the small isolation
// test plot) measured 44–51 real seconds confirm-to-completed across two
// robot missions ("Crop Inspection" 51s, "Autonomous Patrol" 44s) — both
// inside the requested ~40–60s range; this constant is shared by
// `use-robot-mission-simulation.ts` (see that file's own note), which is
// what those two measurements actually exercised. A DRONE mission's own
// full timing wasn't independently isolated this change (test tooling closed
// the browser mid-cycle on that run rather than any app defect — the
// mission's create/patch calls themselves succeeded), but it runs through
// this exact same tick loop and constant, so the same real distance/speed
// arithmetic applies. This is still the ONE place mission speed is
// controlled — the Digital Twin's visual
// flight above reads the same constant, so lowering it also correctly slows
// the drone's on-screen movement to match, rather than leaving a
// faster-than-real visual animation racing ahead of the actual mission
// state.
export const SIMULATION_TIME_SCALE = 4;
const SURVEY_PHASE_START_PERCENT = 15;
const SURVEY_PHASE_END_PERCENT = 85;

/**
 * Advances every in-flight mission's progress/phase/battery/heading once a
 * second, and is the ONLY place a drone's route is diverted onto (or
 * restored from) a mission flight path — via the Fleet Store's own
 * `setDroneActiveRoute`, never by touching `drone.tsx`. Call this hook from
 * any page that should keep missions moving while mounted (the Mission
 * Planner page, the Digital Twin page — same lifecycle-scoped-to-mounted-
 * page pattern the existing autonomous-unit telemetry poll already uses in
 * `digital-twin-page.tsx` (missions simply don't progress while neither page
 * is open, exactly like Drone Alpha's own patrol animation only runs while
 * the Digital Twin's Canvas is mounted).
 */
export function useMissionSimulation(): void {
  useEffect(() => {
    function tick() {
      const { order, missions } = useMissionStore.getState();

      for (const id of order) {
        const mission = missions[id];
        if (!mission || !mission.estimate || !mission.assignedDroneId) continue;
        if (!MISSION_FLIGHT_STATUSES.includes(mission.status)) continue;

        const drone = useFleetStore.getState().drones[mission.assignedDroneId];
        if (!drone) continue;

        // Real, segment-aware path length (unequal
        // segments) — the SAME distances the generated waypoints actually
        // describe, not an assumed equal split of the estimated duration.
        const { cumulativeDistances, totalDistance } = computeRouteDistances(mission.waypoints);

        if (totalDistance <= 0) {
          // Degenerate route (empty or single-waypoint, Part 10's edge
          // cases) — nothing to traverse, so nothing can be prematurely cut
          // short; complete outright rather than divide by zero.
          useMissionStore.getState().completeMission(id);
          continue;
        }

        const effectiveSpeedMps = mission.speedMps * SIMULATION_TIME_SCALE;
        const traveledDistance = (mission.progressPercent / 100) * totalDistance + effectiveSpeedMps * (TICK_MS / 1000);
        const nextProgress = Math.min(100, (traveledDistance / totalDistance) * 100);
        const deltaPercent = nextProgress - mission.progressPercent;

        if (nextProgress >= 100) {
          useMissionStore.getState().completeMission(id);
          continue;
        }

        const nextPhase = derivePhaseFromProgress(nextProgress);
        const alreadyDiverted = drone.activeMissionId === mission.id;

        // Purely additive, see `scanForIssues`'s
        // own doc comment. Only while actually surveying the plot (not
        // during the takeoff/return legs, which pass through open ground on
        // their way to/from it).
        if (nextPhase === "surveying") {
          scanForIssues(mission, mission.waypoints, cumulativeDistances, traveledDistance);
        }

        // Diverts the drone exactly once, the first tick progress moves past
        // "preparing" — the drone hasn't left home yet during preparing, so
        // there's nothing to divert (or drain battery for) before this.
        if (!alreadyDiverted && nextPhase !== "preparing") {
          useFleetStore.getState().setDroneActiveRoute(drone.id, missionRoute(mission), { status: "on-mission", missionId: mission.id });
        }

        if (alreadyDiverted || nextPhase !== "preparing") {
          const batteryDelta = (deltaPercent / 100) * mission.estimate.batteryPercent;
          useFleetStore.getState().updateDroneTelemetry(drone.id, {
            batteryPercent: Math.max(5, Math.round((drone.batteryPercent - batteryDelta) * 10) / 10),
          });
        }

        const waypoints = mission.waypoints;
        const currentWaypointIndex = waypointIndexForDistance(cumulativeDistances, Math.min(traveledDistance, totalDistance));
        const nextWaypointIndex = Math.min(waypoints.length - 1, currentWaypointIndex + 1);

        let headingDegrees: number | null = null;
        const from = waypoints[currentWaypointIndex];
        const to = waypoints[nextWaypointIndex];
        if (from && to && nextWaypointIndex !== currentWaypointIndex) {
          const [x1, z1] = from.position;
          const [x2, z2] = to.position;
          const radians = Math.atan2(x2 - x1, z2 - z1);
          headingDegrees = (radians * (180 / Math.PI) + 360) % 360;
        }

        const coverageProgressPercent =
          nextProgress <= SURVEY_PHASE_START_PERCENT
            ? 0
            : nextProgress >= SURVEY_PHASE_END_PERCENT
              ? 100
              : ((nextProgress - SURVEY_PHASE_START_PERCENT) / (SURVEY_PHASE_END_PERCENT - SURVEY_PHASE_START_PERCENT)) * 100;

        useMissionStore.getState().updateMissionProgress(id, {
          status: nextPhase,
          progressPercent: nextProgress,
          coverageProgressPercent,
          currentWaypointIndex,
          headingDegrees,
        });
      }
    }

    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, []);
}
