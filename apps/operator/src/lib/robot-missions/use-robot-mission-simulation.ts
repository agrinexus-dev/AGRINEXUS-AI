"use client";

import { useEffect } from "react";

import { useFindingStore } from "@/lib/findings/finding-store";
import { generatePlotIssueCandidates, ROBOT_SCAN_RADIUS_M, withinScanRadius } from "@/lib/findings/issue-generator";
import { getPlotById } from "@/lib/plots/plot-store";
import { useRobotStore } from "@/lib/robots/robot-store";

import { computeRouteDistances, interpolatePositionAtDistance, waypointIndexForDistance } from "./robot-mission-defaults";
import { supportedIssueTypesFor } from "./robot-mission-capabilities";
import { useRobotMissionStore } from "./robot-mission-store";
import { deriveRobotMissionPhaseFromProgress, robotMissionRoute, ROBOT_MISSION_ACTIVE_STATUSES, type RobotMissionType } from "./types";

/**
 * Mirrors `use-mission-simulation.ts`'s own
 * `scanForIssues`, for the robot's "working" phase over its target plot.
 * `recordDetection`'s `vehicle: "robot"` is what lets a supported issue
 * type actually receive its simulated corrective action (see
 * `lib/findings/types.ts`'s `ROBOT_ISSUE_CAPABILITIES`).
 *
 * Unlike the drone version, this one passes
 * `supportedIssueTypesFor(mission.missionType)` into the generator so a
 * robot mission can never even generate a candidate outside what its own
 * mission type is curated to detect/resolve (see
 * `robot-mission-capabilities.ts`) — never nutrient-deficiency/crop-stress/
 * damaged-crop-area (no robot solution exists for any of those), and never
 * an issue type outside this SPECIFIC mission type's own supported set
 * (e.g. a "Weed Detection & Removal" mission never generates a fungal-risk
 * candidate). A raw, uncurated mission type ("manual-drive",
 * "seed-planting", etc.) has an empty supported set, so it generates
 * nothing — no automated work pattern to scan during, same as before.
 */
function scanForIssues(
  mission: { id: string; name: string; missionType: RobotMissionType; targetPlotId: string | null },
  waypoints: { position: [number, number] }[],
  cumulativeDistances: number[],
  traveledDistance: number,
): void {
  if (!mission.targetPlotId) return;
  const plot = getPlotById(mission.targetPlotId);
  if (!plot) return;

  const vehiclePosition = interpolatePositionAtDistance(waypoints, cumulativeDistances, traveledDistance);
  const candidates = generatePlotIssueCandidates(mission.id, plot.id, plot.label, plot.center, plot.size, supportedIssueTypesFor(mission.missionType));

  for (const candidate of candidates) {
    if (!withinScanRadius(vehiclePosition, candidate.position, ROBOT_SCAN_RADIUS_M)) continue;
    useFindingStore.getState().recordDetection({
      candidate,
      plotId: plot.id,
      plotLabel: plot.label,
      missionId: mission.id,
      missionName: mission.name,
      vehicle: "robot",
    });
  }
}

const TICK_MS = 1000;
// Same explicit, documented simulation-speed compression `use-mission-simulation.ts`
// uses for drones — no backend yet, so an estimated duration is
// compressed into a demoable timeframe. The estimate shown in the Robot
// Mission Inspector is never altered by this; only how fast simulated time
// passes.
//
// Mirrors `use-mission-simulation.ts`'s own fix exactly —
// this factor must apply to the SAME quantity (real distance traveled) on
// both this tick and the Digital Twin's visual drive (`systems/robot.tsx`),
// not independently to a time-based progress formula here while the robot
// physically moved at real, unaccelerated speed. That mismatch is what let
// a robot mission complete after covering only a small fraction of the
// generated route. Exported so `systems/robot.tsx` can apply the identical
// multiplier while actively driving a mission route.
//
// Lowered from 12 to 4, mirroring `use-mission-simulation.ts`'s
// own identical change and reasoning: live-measured completion times at 12x
// were too fast (roughly 8–25 real seconds) for a farmer to actually watch
// Preparing → Driving/Working → Returning → Completed happen. At 4x, two
// full live end-to-end runs against real farm plots (20×20 real plot size)
// measured 51 real seconds confirm-to-completed for a "Crop Inspection"
// mission and 44 real seconds for an "Autonomous Patrol" mission — both
// inside the requested ~40–60s range (
// evidence for the transcripts these came from).
export const SIMULATION_TIME_SCALE = 4;
const WORK_PHASE_START_PERCENT = 20;
const WORK_PHASE_END_PERCENT = 85;

/**
 * Advances every in-progress robot mission's progress/phase/battery/heading
 * once a second, and is the ONLY place a robot's route is diverted onto (or
 * restored from) a mission ground route — via the Robot Store's own
 * `setRobotActiveRoute`, never by touching `robot.tsx`. Mirrors
 * `useMissionSimulation` field-for-field; call this hook from any page that
 * should keep robot missions moving while mounted (the Robot Mission Planner
 * page, the Digital Twin page).
 */
export function useRobotMissionSimulation(): void {
  useEffect(() => {
    function tick() {
      const { order, missions } = useRobotMissionStore.getState();

      for (const id of order) {
        const mission = missions[id];
        if (!mission || !mission.estimate || !mission.assignedRobotId) continue;
        if (!ROBOT_MISSION_ACTIVE_STATUSES.includes(mission.status)) continue;

        const robot = useRobotStore.getState().robots[mission.assignedRobotId];
        if (!robot) continue;

        // Real, segment-aware path length (unequal
        // segments) — the SAME distances the generated waypoints actually
        // describe, not an assumed equal split of the estimated duration.
        const { cumulativeDistances, totalDistance } = computeRouteDistances(mission.waypoints);

        if (totalDistance <= 0) {
          // Degenerate route (empty or single-waypoint, Part 10's edge
          // cases) — nothing to traverse; complete outright rather than
          // divide by zero.
          useRobotMissionStore.getState().completeMission(id);
          continue;
        }

        const effectiveSpeedMps = mission.speedMps * SIMULATION_TIME_SCALE;
        const traveledDistance = (mission.progressPercent / 100) * totalDistance + effectiveSpeedMps * (TICK_MS / 1000);
        const nextProgress = Math.min(100, (traveledDistance / totalDistance) * 100);
        const deltaPercent = nextProgress - mission.progressPercent;

        if (nextProgress >= 100) {
          useRobotMissionStore.getState().completeMission(id);
          continue;
        }

        const nextPhase = deriveRobotMissionPhaseFromProgress(nextProgress);
        const alreadyDiverted = robot.activeMissionId === mission.id;

        // Purely additive, see `scanForIssues`'s
        // own doc comment. Only while actually working the plot.
        if (nextPhase === "working") {
          scanForIssues(mission, mission.waypoints, cumulativeDistances, traveledDistance);
        }

        // Diverts the robot exactly once, the first tick progress moves past
        // "preparing" — the robot hasn't left home yet during preparing, so
        // there's nothing to divert (or drain battery for) before this.
        if (!alreadyDiverted && nextPhase !== "preparing") {
          useRobotStore.getState().setRobotActiveRoute(robot.id, robotMissionRoute(mission), {
            status: "on-mission",
            missionId: mission.id,
            missionLabel: mission.name,
            missionTargetPlotId: mission.targetPlotId,
          });
        }

        if (alreadyDiverted || nextPhase !== "preparing") {
          const batteryDelta = (deltaPercent / 100) * mission.estimate.batteryPercent;
          useRobotStore.getState().updateRobotTelemetry(robot.id, {
            batteryPercent: Math.max(5, Math.round((robot.batteryPercent - batteryDelta) * 10) / 10),
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
          nextProgress <= WORK_PHASE_START_PERCENT
            ? 0
            : nextProgress >= WORK_PHASE_END_PERCENT
              ? 100
              : ((nextProgress - WORK_PHASE_START_PERCENT) / (WORK_PHASE_END_PERCENT - WORK_PHASE_START_PERCENT)) * 100;

        useRobotMissionStore.getState().updateMissionProgress(id, {
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
