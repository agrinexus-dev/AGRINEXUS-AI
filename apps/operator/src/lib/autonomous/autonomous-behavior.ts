"use client";

import { useEffect } from "react";

import { droneRoute, robotRoute } from "@/components/digital-twin/scene/farm-data";
import { useFleetStore } from "@/lib/fleet/fleet-store";
import type { DroneStatus } from "@/lib/fleet/types";
import { useMissionStore } from "@/lib/missions/mission-store";
import { isVehicleClaimedByEnabledRecurring } from "@/lib/recurring-missions/recurring-mission-store";
import { useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";
import { useRobotStore } from "@/lib/robots/robot-store";
import type { RobotStatus } from "@/lib/robots/types";

/**
 * The global, TOGGLEABLE autonomous-behavior system.
 * Reintroduces the pre-Phase-4 "drone/robot patrols when it has no mission"
 * behavior, but now strictly opt-in per vehicle KIND (two independent
 * switches — `useFleetStore`'s/`useRobotStore`'s own `autonomousEnabled`
 * flag, default OFF) and never allowed to override a higher-priority
 * activity. Deliberately its own small module rather than logic bolted
 * into the Fleet/Robot Store directly:
 *  - `fleet-store.ts`/`robot-store.ts` stay free of any cross-store import
 *  (they never import Mission/RobotMission/RecurringMission stores
 *  today, and adding one here would create exactly the import cycle
 *  `recurring-mission-store.ts` already avoids by depending ON
 *  fleet/robot-store, never the other way).
 *  - This module is the one place allowed to read all four stores
 *  (Fleet, Robot, Mission, RobotMission — via `isVehicleClaimedByEnabledRecurring`,
 *  Recurring too) to decide "is this vehicle actually free right now?"
 *
 * PRIORITY, enforced entirely by which statuses this sweep is
 * willing to touch — never by special-casing call sites in
 * mission-store.ts/robot-mission-store.ts/recurring-mission-store.ts,
 * every one of which is UNCHANGED by this change:
 *  1. Active mission — a drone/robot with `activeMissionId` set, or mid a
 *  mission's brief "preparing" phase (about to be diverted by the
 *  simulation tick — see `hasPreparingXMission` below), is NEVER
 *  touched.
 *  2. Recurring mission — `isVehicleClaimedByEnabledRecurring` excludes
 *  any vehicle an ENABLED recurring schedule owns, whether it's
 *  currently mid-run (status is a moving one, already excluded by (1)
 *  via `activeMissionId`) or resting at its charging station between
 *  runs (status "charging" — structurally excluded below too, since
 *  "charging" is never one of the FREE statuses this sweep reconciles).
 *  3. Autonomous behavior, if enabled — the only case actually reachable
 *  once (1) and (2) don't apply.
 *  4. Idle/home — the default when autonomous is OFF.
 *
 * "charging" is deliberately never touched by this sweep at all (for
 * either vehicle kind) — for drones it only ever means "resting on an
 * enabled recurring schedule" (Part 2 rule (2) above), and for robots it
 * ALSO covers the pre-existing, unrelated manual "Send Home" feature
 * (`robot-store.ts`'s `sendRobotHome`/`markArrivedHome`), which recharges
 * the battery while charging (`use-robot-simulation.ts`) — autonomous mode
 * must not yank a robot back out of a legitimate recharge stop.
 * "paused"/"returning"/"maintenance"/"offline"/"on-mission" are likewise
 * never touched — every one of those is either mission-owned or an
 * explicit, separate manual operator action this change does not touch.
 */

// Exported (previously private) so
// `action-executor.ts`'s new "handle this finding" vehicle-availability
// check reuses the EXACT same "free" definition this file's own autonomous
// sweep already uses, rather than a second, possibly-drifting copy (Part 7:
// "based on the existing architecture"). No behavior change here — same
// two arrays, just visible outside this module now.
export const FREE_DRONE_STATUSES: DroneStatus[] = ["idle", "patrolling"];
export const FREE_ROBOT_STATUSES: RobotStatus[] = ["idle", "active"];

/** True while a mission is in its brief "preparing" phase for this drone — `use-mission-simulation.ts` hasn't diverted the drone's route yet (that only happens once progress moves past "preparing"), so `activeMissionId` is still null and the drone would otherwise look "free" to this sweep for one tick. */
function hasPreparingDroneMission(droneId: string): boolean {
  const { order, missions } = useMissionStore.getState();
  return order.some((id) => {
    const mission = missions[id];
    return Boolean(mission && mission.assignedDroneId === droneId && mission.status === "preparing");
  });
}

function hasPreparingRobotMission(robotId: string): boolean {
  const { order, missions } = useRobotMissionStore.getState();
  return order.some((id) => {
    const mission = missions[id];
    return Boolean(mission && mission.assignedRobotId === robotId && mission.status === "preparing");
  });
}

/** Reconciles one drone's route/status against the current autonomous flag — a no-op if it's already in the right state (never bumps `routeVersion`, so a free drone that's already correctly idle/patrolling is never remounted). */
function reconcileDrone(droneId: string, autonomousEnabled: boolean): void {
  const drone = useFleetStore.getState().drones[droneId];
  if (!drone) return;
  if (drone.activeMissionId !== null) return;
  if (!FREE_DRONE_STATUSES.includes(drone.status)) return;
  if (hasPreparingDroneMission(droneId)) return;
  if (isVehicleClaimedByEnabledRecurring("drone", droneId)) return;

  const desiredStatus: DroneStatus = autonomousEnabled ? "patrolling" : "idle";
  if (drone.status === desiredStatus) return;

  const route = autonomousEnabled ? droneRoute : drone.homePatrolRoute;
  useFleetStore.getState().setDroneActiveRoute(droneId, route, { status: desiredStatus, missionId: null });
}

function reconcileRobot(robotId: string, autonomousEnabled: boolean): void {
  const robot = useRobotStore.getState().robots[robotId];
  if (!robot) return;
  if (robot.activeMissionId !== null) return;
  if (!FREE_ROBOT_STATUSES.includes(robot.status)) return;
  if (hasPreparingRobotMission(robotId)) return;
  if (isVehicleClaimedByEnabledRecurring("robot", robotId)) return;

  const desiredStatus: RobotStatus = autonomousEnabled ? "active" : "idle";
  if (robot.status === desiredStatus) return;

  const route = autonomousEnabled ? robotRoute : robot.homePatrolRoute;
  useRobotStore.getState().setRobotActiveRoute(robotId, route, { status: desiredStatus, missionId: null, missionLabel: null, missionTargetPlotId: null });
}

function reconcileAllDrones(): void {
  const { order } = useFleetStore.getState();
  const autonomousEnabled = useFleetStore.getState().autonomousEnabled;
  for (const id of order) reconcileDrone(id, autonomousEnabled);
}

function reconcileAllRobots(): void {
  const { order } = useRobotStore.getState();
  const autonomousEnabled = useRobotStore.getState().autonomousEnabled;
  for (const id of order) reconcileRobot(id, autonomousEnabled);
}

/**
 * Real persistence for the two toggles below, added
 * because they were previously Zustand-only ("session-only... not durable
 * business data", per this file's own now-superseded history) and reset to
 * OFF on every refresh, which the product now requires not to happen.
 * `persistAutonomousState` is a fire-and-forget PATCH — the Switch is
 * already optimistic-UI (flips instantly via the synchronous store update
 * below), and a failed PATCH is still honestly reflected on the NEXT
 * refresh (the stale-but-real persisted value comes back, never a false
 * "it saved" claim) — the same fail-open convention `removeDrone`/
 * `removeRobot` already use for their own network calls.
 *
 * Made single-flight PER VEHICLE KIND: `persistDrone`/
 * `persistRobot` below never have more than one PATCH in flight at once for
 * their own kind. Rapidly toggling the same switch several times used to
 * fire several concurrent PATCH requests with no guarantee they'd resolve
 * at the server in the order they were sent (ordinary network/event-loop
 * reordering) — the LAST-ARRIVING one wins the DB write, which isn't
 * necessarily the last one the user actually clicked. Coalescing into "at
 * most one in flight, always eventually sending the latest queued value"
 * removes that race entirely without touching the API shape (still the
 * exact same `PATCH /api/farm/autonomous` with a `{droneAutonomousEnabled}`/
 * `{robotAutonomousEnabled}` body) or the persistence model.
 */
let dronePersistInFlight = false;
let dronePendingValue: boolean | null = null;
let robotPersistInFlight = false;
let robotPendingValue: boolean | null = null;

async function sendAutonomousPatch(patch: { droneAutonomousEnabled?: boolean; robotAutonomousEnabled?: boolean }): Promise<void> {
  try {
    await fetch("/api/farm/autonomous", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    // Best-effort — see doc comment above.
  }
}

async function persistDroneAutonomousState(enabled: boolean): Promise<void> {
  dronePendingValue = enabled;
  if (dronePersistInFlight) return; // an in-flight request will pick up this newer value once it loops
  dronePersistInFlight = true;
  while (dronePendingValue !== null) {
    const value = dronePendingValue;
    dronePendingValue = null;
    await sendAutonomousPatch({ droneAutonomousEnabled: value });
  }
  dronePersistInFlight = false;
}

async function persistRobotAutonomousState(enabled: boolean): Promise<void> {
  robotPendingValue = enabled;
  if (robotPersistInFlight) return;
  robotPersistInFlight = true;
  while (robotPendingValue !== null) {
    const value = robotPendingValue;
    robotPendingValue = null;
    await sendAutonomousPatch({ robotAutonomousEnabled: value });
  }
  robotPersistInFlight = false;
}

/**
 * The ONLY functions the UI/AURA should call to flip a toggle — combines
 * the store's own primitive `setAutonomousEnabled` (so `useFleetDrones()`/
 * `useRobots()` consumers see the flag change immediately) with an
 * immediate sweep of every currently-free vehicle, so switching a toggle
 * ON/OFF takes visible effect right away rather than waiting for the next
 * periodic tick (see `useAutonomousBehaviorScheduler` below) — and now also
 * persists the new value, so it survives a refresh.
 *
 * Each call bumps its own kind's `*ActionSeq` counter
 * BEFORE touching the store. `fetchAutonomousState` below captures the
 * current counter when its GET starts and only applies the fetched value if
 * the counter is still unchanged when the response arrives — so a user
 * action taken WHILE an earlier hydration GET is still in flight can never
 * be clobbered by that GET resolving afterward with a now-stale server
 * value. This is the fix for the exact race: "GET starts
 * → user toggles → GET finishes → GET overwrites the newer user choice."
 */
let droneActionSeq = 0;
let robotActionSeq = 0;

export function setDroneAutonomousEnabled(enabled: boolean): void {
  droneActionSeq += 1;
  useFleetStore.getState().setAutonomousEnabled(enabled);
  reconcileAllDrones();
  void persistDroneAutonomousState(enabled);
}

export function setRobotAutonomousEnabled(enabled: boolean): void {
  robotActionSeq += 1;
  useRobotStore.getState().setAutonomousEnabled(enabled);
  reconcileAllRobots();
  void persistRobotAutonomousState(enabled);
}

/**
 * Loads the persisted value from `Farm.
 * droneAutonomousEnabled`/`robotAutonomousEnabled` and applies it locally
 * (plus an immediate reconciliation sweep, same as the setters above).
 * EXPORTED (not module-private) so `components/aura/aura-mount.tsx` can
 * also call it — live testing found AURA's `show-autonomous-status`
 * deterministic command reads the in-memory flag directly, so opening AURA
 * from Mission Control (the one page that never mounts
 * `useAutonomousBehaviorScheduler`) reported a stale default instead of the
 * real persisted value. Same page-independence fix already applied
 * to findings/plots/recurring-missions/drones/robots/sensors/alerts/
 * missions, extended to this flag too. Guarded by `hydrationAttempted`
 * below, so calling it from both places issues at most one real GET.
 * Otherwise called once by `useAutonomousBehaviorScheduler`'s mount effect
 * below, so
 * every page that needs autonomous behavior working (Drone Fleet, Ground
 * Robots, Digital Twin, both Mission Planners) also hydrates the real
 * persisted state, with no new page-level wiring required. Applies the
 * fetched values directly to each store's raw setter (not through
 * `setDroneAutonomousEnabled`/`setRobotAutonomousEnabled` above) so
 * hydration never immediately re-PATCHes the exact value it just read.
 *
 * Each fetched value is now applied ONLY if no
 * `set*AutonomousEnabled` call happened for that same vehicle kind since
 * this GET started (checked via `droneActionSeq`/`robotActionSeq`). Drone
 * and robot are tracked with fully independent counters, so a race
 * resolved (or not) for one kind never affects the other — a drone toggle
 * still can never touch `robotActionSeq`/robot state, and vice versa.
 */
let hydrationAttempted = false;
export async function fetchAutonomousState(): Promise<void> {
  if (hydrationAttempted) return;
  hydrationAttempted = true;
  const droneSeqAtStart = droneActionSeq;
  const robotSeqAtStart = robotActionSeq;
  try {
    const response = await fetch("/api/farm/autonomous");
    if (!response.ok) return;
    const body = (await response.json()) as { droneAutonomousEnabled?: boolean; robotAutonomousEnabled?: boolean };

    if (typeof body.droneAutonomousEnabled === "boolean" && droneActionSeq === droneSeqAtStart) {
      useFleetStore.getState().setAutonomousEnabled(body.droneAutonomousEnabled);
      reconcileAllDrones();
    }
    if (typeof body.robotAutonomousEnabled === "boolean" && robotActionSeq === robotSeqAtStart) {
      useRobotStore.getState().setAutonomousEnabled(body.robotAutonomousEnabled);
      reconcileAllRobots();
    }
  } catch {
    hydrationAttempted = false; // allow a retry the next time a relevant page mounts
  }
}

const TICK_MS = 2000;

/**
 * The periodic safety net — mirrors `useRecurringMissionScheduler`'s exact
 * "runs only while a page that needs it is mounted" lifecycle and tick
 * pattern. Needed because a vehicle can become "free" for reasons this
 * module has no direct hook into (a normal mission completing via
 * `mission-store.ts`'s `completeMission`, a recurring schedule being
 * disabled) — rather than threading an autonomous-mode callback into
 * every one of those UNCHANGED call sites, this tick just periodically
 * re-checks every vehicle and reconciles any that have newly become free.
 * Idempotent per tick (see the `desiredStatus === status` early-return in
 * `reconcileDrone`/`reconcileRobot` above) so an already-correct vehicle is
 * never touched/remounted twice.
 */
export function useAutonomousBehaviorScheduler(): void {
  useEffect(() => {
    // Loads the persisted ON/OFF value once (module-level guard,
    // so mounting this hook on 5 different pages in one session issues at
    // most one GET); reconciles again itself once that resolves, on top of
    // the tick's own immediate call below.
    void fetchAutonomousState();

    function tick() {
      reconcileAllDrones();
      reconcileAllRobots();
    }
    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, []);
}
