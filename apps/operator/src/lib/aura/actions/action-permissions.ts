/**
 * Central permission gate — every action passes through
 * `canExecuteAction` before the Action Executor touches anything. Every
 * action is allowed for every role today; the lookup table exists so a
 * future role restriction is a one-line data change here, not a new check
 * scattered through each action handler.
 */
const ACTION_ROLE_ALLOWLIST: Record<string, readonly string[] | "all"> = {
  "focus-plot": "all",
  "reset-camera": "all",
  "locate-drone": "all",
  "locate-robot": "all",
  "set-layer": "all",
  "presentation-mode": "all",
  "open-page": "all",
  "query-last-action": "all",
  // Mission Planning & Flight Operations.
  "create-mission": "all",
  "assign-drone-to-mission": "all",
  "start-mission": "all",
  "pause-mission": "all",
  "resume-mission": "all",
  "cancel-mission": "all",
  "delete-mission": "all",
  "duplicate-mission": "all",
  "show-active-missions": "all",
  "locate-mission": "all",
  "mission-status": "all",
  "mission-progress": "all",
  "mission-eta": "all",
  "mission-battery": "all",
  // Ground Robot Fleet Management.
  "pause-robot": "all",
  "resume-robot": "all",
  "send-robot-home": "all",
  "maintenance-mode-robot": "all",
  "assign-robot": "all",
  "robot-status": "all",
  "robot-battery": "all",
  "robot-location": "all",
  "robot-health": "all",
  "show-active-robots": "all",
  "list-robots": "all",
  // Ground Robot Mission Planner.
  "create-robot-mission": "all",
  "assign-robot-to-mission": "all",
  "start-robot-mission": "all",
  "pause-robot-mission": "all",
  "resume-robot-mission": "all",
  "cancel-robot-mission": "all",
  "delete-robot-mission": "all",
  "duplicate-robot-mission": "all",
  "show-active-robot-missions": "all",
  "list-robot-missions": "all",
  "locate-robot-mission": "all",
  "robot-mission-status": "all",
  "robot-mission-progress": "all",
  "robot-mission-eta": "all",
  "robot-mission-battery": "all",
  // Smart Sensor Network.
  "locate-sensor": "all",
  "show-sensor": "all",
  "sensor-status": "all",
  "sensor-battery": "all",
  "sensor-reading": "all",
  "sensor-health": "all",
  "list-sensors": "all",
  "show-offline-sensors": "all",
  "show-critical-sensors": "all",
  // Sensor Analytics & Historical Intelligence.
  "compare-sensors": "all",
  "show-sensor-alerts": "all",
  "show-heatmap": "all",
  "show-soil-moisture-trend": "all",
  "show-temperature-trend": "all",
  "sensor-trend": "all",
  "sensor-statistics": "all",
  // Agricultural Reasoning & Sensor-Driven
  // Missions. These 5 were added to `ACTIONABLE_COMMAND_IDS` (action-
  // executor.ts) when their handlers were built, but never added here —
  // `canExecuteAction` denies any commandId missing from this table
  // outright ("No permission rule is defined for..."), so all 5 were
  // unreachable despite having fully-working handlers. Same "all roles" the
  // rest of this table uses; no role restriction is enforced anywhere yet.
  "create-sensor-mission": "all",
  "plot-recommendation": "all",
  "fields-needing-irrigation": "all",
  "fields-needing-inspection": "all",
  "plot-trend": "all",
  // Commands newly wired to an executor (see action-executor.ts) — each
  // reuses an already-working handler's exact permission level, since each
  // is either an alias for or a close variant of that existing command.
  "inspect-plot": "all",
  "scan-plot": "all",
  "layer-toggle": "all",
  "generate-report": "all",
  "show-unhealthy-crops": "all",
  "create-drone-mission": "all",
  "launch-inspection": "all",
  // Plot Comparison.
  "compare-plots": "all",
  // Recurring Missions.
  "create-recurring-mission": "all",
  "list-recurring-missions": "all",
  "stop-recurring-mission": "all",
  "start-recurring-mission": "all",
  // Global autonomous-behavior toggles.
  "enable-drone-autonomous": "all",
  "disable-drone-autonomous": "all",
  "enable-robot-autonomous": "all",
  "disable-robot-autonomous": "all",
  "show-autonomous-status": "all",
  // Command-parser hardening additions.
  "list-missions": "all",
  "list-drones": "all",
  "clarify-mission-vehicle": "all",
  // Same "all roles" policy every
  // other entry in this table already uses; Farmer isn't granted anything
  // Operator/Admin don't already have here, and farm-scoping (which
  // findings/robots this command can even see) is enforced upstream, at the
  // data-fetch layer, not by a role check on the action itself.
  "handle-selected-finding": "all",
  // Confirming/cancelling a proposal `handle-selected-finding`
  // itself just made; same "all roles, farm-scoping enforced upstream" policy.
  "confirm-pending-action": "all",
  "cancel-pending-action": "all",
  // AURA Natural-Language-Actions phase — same "all roles, farm-scoping
  // enforced upstream (real Plot/Robot/Drone store data only)" policy.
  "request-field-inspection": "all",
  // Vehicle-agnostic pronoun-
  // style mission control ("Pause it.", "Resume it.", "Cancel it."/"Stop
  // this mission."), and the mission card's own Pause/Resume/Cancel
  // buttons, which call the identical underlying functions these commandIds
  // route to (see `action-executor.ts`'s `pauseMissionById`/
  // `resumeMissionById`/`cancelMissionById`). Same "all roles" policy every
  // other mission-lifecycle command above already uses.
  "pause-active-mission": "all",
  "resume-active-mission": "all",
  "cancel-active-mission": "all",
  // A farmer correcting an already-proposed vehicle ("Use the drone
  // instead."); same "all roles" policy.
  "override-pending-vehicle": "all",
};

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export function canExecuteAction(commandId: string, userRole: string | null): PermissionResult {
  const allowlist = ACTION_ROLE_ALLOWLIST[commandId];
  if (!allowlist) {
    return { allowed: false, reason: `No permission rule is defined for "${commandId}".` };
  }
  if (allowlist === "all") {
    return { allowed: true };
  }
  if (!userRole || !allowlist.includes(userRole)) {
    return { allowed: false, reason: `Your role (${userRole ?? "unknown"}) doesn't have permission for this action.` };
  }
  return { allowed: true };
}
