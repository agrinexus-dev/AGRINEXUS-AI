import { FREE_DRONE_STATUSES, FREE_ROBOT_STATUSES, setDroneAutonomousEnabled, setRobotAutonomousEnabled } from "@/lib/autonomous/autonomous-behavior";
import { useFarmerSettingsStore } from "@/lib/farmer/farmer-settings-store";
import { useFleetStore } from "@/lib/fleet/fleet-store";
import { DRONE_STATUS_LABELS, type DroneRecord } from "@/lib/fleet/types";
import { useFindingStore } from "@/lib/findings/finding-store";
import { CROP_ISSUE_TYPE_LABELS, isRobotCapableIssue, type CropFinding, type CropIssueType } from "@/lib/findings/types";
import { useMissionStore } from "@/lib/missions/mission-store";
import { MISSION_FLIGHT_STATUSES, MISSION_STATUS_LABELS, MISSION_TYPE_LABELS, MISSION_TYPES, type MissionRecord, type MissionStatus, type MissionType } from "@/lib/missions/types";
import { usePlotStore } from "@/lib/plots/plot-store";
import { useRecurringMissionStore } from "@/lib/recurring-missions/recurring-mission-store";
import type { RecurringMissionConfig } from "@/lib/recurring-missions/types";
import { resolveRobotMissionTypeForIssue } from "@/lib/robot-missions/robot-mission-capabilities";
import { useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";
import {
  ROBOT_MISSION_ACTIVE_STATUSES,
  ROBOT_MISSION_STATUS_LABELS,
  ROBOT_MISSION_TYPE_LABELS,
  ROBOT_MISSION_TYPES,
  type RobotMissionRecord,
  type RobotMissionStatus,
  type RobotMissionType,
} from "@/lib/robot-missions/types";
import { useRobotStore } from "@/lib/robots/robot-store";
import { CONNECTION_QUALITY_LABELS, ROBOT_MOVING_STATUSES, ROBOT_STATUS_LABELS, type RobotRecord } from "@/lib/robots/types";
import { useAlertStore } from "@/lib/sensor-analytics/alert-store";
import { useHistoricalStore } from "@/lib/sensor-analytics/historical-store";
import {
  buildMissionSensorJustification,
  getAllPlotRecommendations,
  getPlotRecommendation,
  getPlotSensorAnalyticsSnapshot,
} from "@/lib/sensor-analytics/mission-integration";
import { filterSamplesByRange } from "@/lib/sensor-analytics/time-range-parser";
import { computeTrendStats } from "@/lib/sensor-analytics/trend-analysis";
import { ALERT_TYPE_LABELS, TIME_RANGE_LABELS, TIME_RANGE_MS, type TimeRangeId } from "@/lib/sensor-analytics/types";
import { sensorPlotLabel, useSensorStore } from "@/lib/sensors/sensor-store";
import { formatSensorReading, SENSOR_STATUS_LABELS, SENSOR_TYPE_LABELS, SENSOR_TYPE_META, type SensorRecord, type SensorType } from "@/lib/sensors/types";
import { runSerialized } from "@/lib/utils/serial-queue";

import { useLiveContextStore } from "../context/live-context-store";
import type { AuraMissionRef, MissionIntentKind, ParsedCommand } from "../types";
import { useActionBridgeStore } from "./action-bridge-store";
import { useActionHistoryStore } from "./action-history-store";
import { canExecuteAction } from "./action-permissions";
import { usePendingActionStore, type PendingFieldInspectionAction } from "./pending-action-store";

export interface ActionResult {
  success: boolean;
  message: string;
  /**
   * Set ONLY on a genuinely
   * confirmed-persisted mission dispatch (never on a proposal, a failure, or
   * a mission-control action against an already-existing mission — those
   * don't need a NEW card since the original one already live-updates, see
   * `aura-chat-store.ts`'s own doc comment). Tags the chat message this
   * result becomes, so `AuraMissionCard` knows which real mission to render
   * and subscribe to.
   */
  missionRef?: AuraMissionRef;
}

/** Only these commandIds have a real handler below — everything else recognized by the parser still falls back to the existing "not available yet" reply (see `client/aura-chat-store.ts`), unchanged from 013A/013B. */
const ACTIONABLE_COMMAND_IDS = new Set([
  "focus-plot",
  "reset-camera",
  "locate-drone",
  "locate-robot",
  "set-layer",
  "presentation-mode",
  "open-page",
  "query-last-action",
  // Mission Planning & Flight Operations.
  "create-mission",
  "assign-drone-to-mission",
  "start-mission",
  "pause-mission",
  "resume-mission",
  "cancel-mission",
  "delete-mission",
  "duplicate-mission",
  "show-active-missions",
  "locate-mission",
  "mission-status",
  "mission-progress",
  "mission-eta",
  "mission-battery",
  // Ground Robot Fleet Management.
  "pause-robot",
  "resume-robot",
  "send-robot-home",
  "maintenance-mode-robot",
  "assign-robot",
  "robot-status",
  "robot-battery",
  "robot-location",
  "robot-health",
  "show-active-robots",
  "list-robots",
  // Ground Robot Mission Planner.
  "create-robot-mission",
  "assign-robot-to-mission",
  "start-robot-mission",
  "pause-robot-mission",
  "resume-robot-mission",
  "cancel-robot-mission",
  "delete-robot-mission",
  "duplicate-robot-mission",
  "show-active-robot-missions",
  "list-robot-missions",
  "locate-robot-mission",
  "robot-mission-status",
  "robot-mission-progress",
  "robot-mission-eta",
  "robot-mission-battery",
  // Smart Sensor Network.
  "locate-sensor",
  "show-sensor",
  "sensor-status",
  "sensor-battery",
  "sensor-reading",
  "sensor-health",
  "list-sensors",
  "show-offline-sensors",
  "show-critical-sensors",
  // Sensor Analytics & Historical Intelligence.
  "compare-sensors",
  "show-sensor-alerts",
  "show-heatmap",
  "show-soil-moisture-trend",
  "show-temperature-trend",
  "sensor-trend",
  "sensor-statistics",
  // Agricultural Reasoning & Sensor-Driven Missions.
  "create-sensor-mission",
  "plot-recommendation",
  "fields-needing-irrigation",
  "fields-needing-inspection",
  "plot-trend",
  // Previously recognized by the parser but wired to no handler at all,
  // so each fell through to the API route's stale not-yet-implemented
  // placeholder reply — every one of these is either a
  // genuine alias for an existing command (reusing that command's exact
  // handler below) or, for `launch-inspection` only, a command with no
  // real equivalent yet, given its own honest "not available" handler
  // rather than fake functionality.
  "inspect-plot",
  "scan-plot",
  "layer-toggle",
  "generate-report",
  "show-unhealthy-crops",
  "create-drone-mission",
  "launch-inspection",
  // Plot Comparison (fixes the "compare Plot A and Plot
  // B" AURA parser collision with `compare-sensors`, which previously
  // intercepted plot-vs-plot phrasing and tried to resolve it as a sensor
  // name — see command-parser.ts's `compare-plots` pattern).
  "compare-plots",
  // Recurring Missions.
  "create-recurring-mission",
  "list-recurring-missions",
  "stop-recurring-mission",
  "start-recurring-mission",
  // Global autonomous-behavior toggles (see
  // `lib/autonomous/autonomous-behavior.ts`). The Mission Planner UI stays
  // the primary control (Part 13's own instruction) — these commands call
  // the exact same `setDroneAutonomousEnabled`/`setRobotAutonomousEnabled`
  // functions that toggle does.
  "enable-drone-autonomous",
  "disable-drone-autonomous",
  "enable-robot-autonomous",
  "disable-robot-autonomous",
  "show-autonomous-status",
  "list-missions",
  "list-drones",
  "clarify-mission-vehicle",
  "handle-selected-finding",
  "confirm-pending-action",
  "cancel-pending-action",
  // AURA Natural-Language-Actions phase.
  "request-field-inspection",
  "pause-active-mission",
  "resume-active-mission",
  "cancel-active-mission",
  "override-pending-vehicle",
]);

export function isActionable(commandId: string | undefined): commandId is string {
  return !!commandId && ACTIONABLE_COMMAND_IDS.has(commandId);
}

/** Every page target now has a real route — this table stays in place (rather than inferring `/${target}`) so a future target added to `PAGE_TARGETS` without a workspace yet still honestly reports "no dedicated page" instead of navigating to a 404. */
const REAL_ROUTES: Record<string, string> = {
  "mission-control": "/",
  "digital-twin": "/digital-twin",
  "drone-fleet": "/drone-fleet",
  "ground-robots": "/ground-robots",
  "sensor-network": "/sensor-network",
  "sensor-analytics": "/sensor-network/analytics",
  weather: "/weather",
  energy: "/energy",
  analytics: "/analytics",
  alerts: "/alerts",
  reports: "/reports",
  settings: "/settings",
};

const LAYER_DISPLAY_NAMES: Record<string, string> = {
  cropHealth: "Crop Health",
  diseaseRisk: "Disease Risk",
  irrigation: "Irrigation",
  droneCoverage: "Drone Coverage",
  decorations: "Decorations",
};

/** "Show Heatmap" resolves the spoken type phrase against this table, then reuses the EXISTING generic `bridge.digitalTwin.setLayer` capability — no new bridge method needed, since the heatmap layer keys already live in `DEFAULT_LAYER_VISIBILITY`. */
const HEATMAP_QUERY_ALIASES: { keywords: string[]; layerKey: string; label: string }[] = [
  { keywords: ["soil moisture"], layerKey: "analyticsSoilMoistureHeatmap", label: "Soil Moisture" },
  { keywords: ["temperature"], layerKey: "analyticsTemperatureHeatmap", label: "Temperature" },
  { keywords: ["humidity"], layerKey: "analyticsHumidityHeatmap", label: "Humidity" },
  { keywords: ["electrical conductivity", " ec", "ec "], layerKey: "analyticsEcHeatmap", label: "EC" },
  { keywords: ["npk", "nitrogen", "phosphorus", "potassium"], layerKey: "analyticsNpkHeatmap", label: "NPK" },
  { keywords: ["ph"], layerKey: "analyticsPhHeatmap", label: "pH" },
];

function matchHeatmapQuery(query: string): { layerKey: string; label: string } | null {
  const needle = ` ${query.trim().toLowerCase()} `;
  for (const entry of HEATMAP_QUERY_ALIASES) {
    if (entry.keywords.some((keyword) => needle.includes(keyword))) return entry;
  }
  return null;
}

const NEEDS_DIGITAL_TWIN = 'That needs the Digital Twin page open — try "Open Digital Twin" first.';
const NEEDS_MISSION_CONTROL = 'That needs the Mission Control page open — try "Open Mission Control" first.';

function plotLabelFromId(plotId: string): string {
  const letter = plotId.slice(-1).toUpperCase();
  return `Plot ${letter}`;
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
}

/** Resolves a `ParsedCommandParams.timeRangeId` string ("Time Range Support") to a real `TIME_RANGE_MS` window, falling back to 24h when no range was mentioned — the same default the general AURA context (`collect-context.ts`) uses, so "sensor trend Alpha" (no range stated) and the general context stay consistent. */
function resolveTimeRangeMs(timeRangeId: string | undefined): { rangeMs: number; rangeLabel: string } {
  const id = (timeRangeId && timeRangeId in TIME_RANGE_MS ? (timeRangeId as Exclude<TimeRangeId, "custom">) : "24h") as Exclude<TimeRangeId, "custom">;
  return { rangeMs: TIME_RANGE_MS[id], rangeLabel: TIME_RANGE_LABELS[id] };
}

/** Resolves a spoken/typed name (e.g. "charlie", or "drone charlie") against the Fleet Store — case-insensitive, matching either the full drone name or its last word, so "Charlie" matches a drone named "Drone Charlie". Never fabricates a match. */
function findDroneByName(name: string) {
  const needle = name.trim().toLowerCase();
  const drones = Object.values(useFleetStore.getState().drones);
  return drones.find((drone) => {
    const droneName = drone.name.toLowerCase();
    return droneName === needle || droneName.endsWith(` ${needle}`) || droneName === `drone ${needle}`;
  });
}

/** Resolves a spoken/typed name against the Robot Store — same convention `findDroneByName` above follows (case-insensitive, full name or last word). With no name, falls back to the Robot Store's own `selectedRobotId` — the robot the Ground Robots page's Right Panel is currently showing, same fallback rule `resolveMission` below uses for missions. Never fabricates a match. */
function resolveRobot(name: string | undefined): RobotRecord | undefined {
  const state = useRobotStore.getState();
  if (!name) {
    return state.selectedRobotId ? state.robots[state.selectedRobotId] : undefined;
  }
  const needle = name.trim().toLowerCase();
  return Object.values(state.robots).find((robot) => {
    const robotName = robot.name.toLowerCase();
    return robotName === needle || robotName.endsWith(` ${needle}`) || robotName === `robot ${needle}`;
  });
}

/**
 * Resolves a spoken/typed sensor query against the Sensor Store (Prompt
 * 016A) — tries a sensor TYPE phrase first (e.g. "soil moisture sensor",
 * "weather station" — handles "Locate Soil Moisture Sensor"/"Locate Weather
 * Station"), then falls back to a name/id/serial match (handles "sensor
 * alpha"), then falls back to the Sensor Store's own `selectedSensorId` if
 * no query text was captured at all. Never fabricates a match.
 */
function resolveSensorByQuery(query: string | undefined): SensorRecord | undefined {
  const state = useSensorStore.getState();
  if (!query) {
    return state.selectedSensorId ? state.sensors[state.selectedSensorId] : undefined;
  }
  const needle = query.trim().toLowerCase();

  const typeMatch = (Object.entries(SENSOR_TYPE_LABELS) as [SensorRecord["sensorType"], string][]).find(([, label]) =>
    needle.includes(label.toLowerCase()),
  );
  if (typeMatch) {
    const [sensorType] = typeMatch;
    const found = Object.values(state.sensors).find((sensor) => sensor.sensorType === sensorType);
    if (found) return found;
  }

  return Object.values(state.sensors).find(
    (sensor) => sensor.name.toLowerCase().includes(needle) || sensor.id.toLowerCase().includes(needle) || sensor.serialNumber.toLowerCase().includes(needle),
  );
}

/** Resolves a robot mission by (partial, case-insensitive) name; with no name, falls back to the Robot Mission Store's own `selectedMissionId` — mirrors `resolveMission` (drones) exactly. Never fabricates a match. */
function resolveRobotMission(name: string | undefined): RobotMissionRecord | undefined {
  const state = useRobotMissionStore.getState();
  if (!name) {
    return state.selectedMissionId ? state.missions[state.selectedMissionId] : undefined;
  }
  const needle = name.trim().toLowerCase();
  return Object.values(state.missions).find((mission) => mission.name.toLowerCase().includes(needle));
}

/** Resolves a mission by (partial, case-insensitive) name; with no name, falls back to the Mission Store's own `selectedMissionId` — the mission the Mission Inspector is currently showing. Never fabricates a match. */
function resolveMission(name: string | undefined): MissionRecord | undefined {
  const state = useMissionStore.getState();
  if (!name) {
    return state.selectedMissionId ? state.missions[state.selectedMissionId] : undefined;
  }
  const needle = name.trim().toLowerCase();
  return Object.values(state.missions).find((mission) => mission.name.toLowerCase().includes(needle));
}

/**
 * Executes one already-recognized, already-actionable command (Prompt
 * 013C). Every branch either calls a REAL capability registered by the page
 * that owns it (see `action-bridge-store.ts`) or returns an honest failure
 * — never a fabricated success. Every attempt (success or failure) is
 * recorded into the in-session action history, except pure introspection
 * ("what was my last action") which isn't itself an action.
 */
export async function executeAction(command: ParsedCommand, userRole: string | null): Promise<ActionResult> {
  const commandId = command.commandId;
  if (!isActionable(commandId)) {
    return { success: false, message: "I can't execute that action yet." };
  }

  const permission = canExecuteAction(commandId, userRole);
  if (!permission.allowed) {
    return recordAndReturn(command, { success: false, message: permission.reason ?? "You don't have permission for that action." });
  }

  const bridge = useActionBridgeStore.getState();

  switch (commandId) {
    case "focus-plot": {
      const plotId = command.params?.plotId;
      if (!bridge.digitalTwin) return recordAndReturn(command, { success: false, message: NEEDS_DIGITAL_TWIN });
      if (!plotId) return recordAndReturn(command, { success: false, message: "I couldn't tell which plot to focus on." });

      const ok = bridge.digitalTwin.focusPlot(plotId);
      return recordAndReturn(
        command,
        ok
          ? { success: true, message: `Camera focused on ${plotLabelFromId(plotId)}.` }
          : { success: false, message: `${plotLabelFromId(plotId)} doesn't exist.` },
      );
    }

    // "Inspect"/"Scan" Plot originally shared `focus-plot`'s exact camera
    // handler (there's no distinct "inspect"/"scan" camera behavior). AURA
    // Natural-Language-Actions phase: when there's no Digital Twin camera to
    // move (Farmer's AURA page never has one — this bridge is Operator's
    // Mission-Control-only concept), "Inspect/Scan Plot A" now means what a
    // Farmer actually means by it — dispatch a real inspection — reusing the
    // exact same flow "Check field A" uses, rather than a dead-end "needs
    // the Digital Twin" reply. On a page that DOES have the bridge
    // (Operator, Mission Control), the original camera-focus behavior is
    // completely unchanged.
    case "inspect-plot":
    case "scan-plot": {
      const plotId = command.params?.plotId;
      if (bridge.digitalTwin && plotId) {
        const ok = bridge.digitalTwin.focusPlot(plotId);
        return recordAndReturn(
          command,
          ok
            ? { success: true, message: `Camera focused on ${plotLabelFromId(plotId)}.` }
            : { success: false, message: `${plotLabelFromId(plotId)} doesn't exist.` },
        );
      }
      return recordAndReturn(command, await handleFieldInspectionRequest(plotId, command.params?.reportedProblemKeyword));
    }

    case "reset-camera": {
      if (!bridge.digitalTwin) return recordAndReturn(command, { success: false, message: NEEDS_DIGITAL_TWIN });
      bridge.digitalTwin.resetCamera();
      return recordAndReturn(command, { success: true, message: "Camera reset." });
    }

    case "locate-drone": {
      const name = command.params?.unitName;
      if (!name) return recordAndReturn(command, { success: false, message: "I couldn't tell which drone to locate." });

      const match = findDroneByName(name);
      if (!match) {
        return recordAndReturn(command, { success: false, message: `There's no drone named "${name}" in the fleet.` });
      }
      if (!bridge.digitalTwin) return recordAndReturn(command, { success: false, message: NEEDS_DIGITAL_TWIN });

      const ok = bridge.digitalTwin.locateDrone(match.id);
      return recordAndReturn(
        command,
        ok
          ? { success: true, message: `Camera following ${match.name}.` }
          : { success: false, message: `${match.name} isn't currently visible in the Digital Twin.` },
      );
    }

    case "locate-robot": {
      const name = command.params?.unitName;
      const match = resolveRobot(name);
      if (!match) {
        return recordAndReturn(
          command,
          name ? { success: false, message: `There's no robot named "${name}" in the fleet.` } : { success: false, message: "I couldn't tell which robot to locate." },
        );
      }
      if (!bridge.digitalTwin) return recordAndReturn(command, { success: false, message: NEEDS_DIGITAL_TWIN });

      const ok = bridge.digitalTwin.locateRobot(match.id);
      return recordAndReturn(
        command,
        ok
          ? { success: true, message: `Camera following ${match.name}.` }
          : { success: false, message: `${match.name} isn't currently visible in the Digital Twin.` },
      );
    }

    // "Toggle Layer" ("hide"/"show" phrasing) reuses this exact handler —
    // command-parser.ts now computes the identical `{layerKey, layerEnabled}`
    // params shape for both commandIds.
    case "set-layer":
    case "layer-toggle": {
      const { layerKey, layerEnabled } = command.params ?? {};
      if (!bridge.digitalTwin) return recordAndReturn(command, { success: false, message: NEEDS_DIGITAL_TWIN });
      if (!layerKey || layerEnabled === undefined) {
        return recordAndReturn(command, { success: false, message: "I couldn't tell which layer to change." });
      }

      const ok = bridge.digitalTwin.setLayer(layerKey, layerEnabled);
      const displayName = LAYER_DISPLAY_NAMES[layerKey] ?? layerKey;
      return recordAndReturn(
        command,
        ok
          ? { success: true, message: `${displayName} layer ${layerEnabled ? "enabled" : "disabled"}.` }
          : { success: false, message: `"${displayName}" isn't a recognized layer.` },
      );
    }

    case "presentation-mode": {
      const enabled = command.params?.presentationEnabled;
      if (!bridge.missionControl) return recordAndReturn(command, { success: false, message: NEEDS_MISSION_CONTROL });
      if (enabled === undefined) {
        return recordAndReturn(command, { success: false, message: "I couldn't tell whether to start or stop Presentation Mode." });
      }

      bridge.missionControl.setPresentationMode(enabled);
      return recordAndReturn(command, { success: true, message: `Presentation Mode ${enabled ? "enabled" : "disabled"}.` });
    }

    // "Generate a report" has no standalone in-chat report-generation
    // capability (a report is a formatted preview built from live data on
    // its own page, not a value that fits in a chat reply) — this routes to
    // the real, already-working Reports page instead of fabricating an
    // in-chat report or leaving the command dead. command-parser.ts sets
    // the same `{pageTarget: "reports"}` params `open-page` itself uses.
    case "open-page":
    case "generate-report": {
      const target = command.params?.pageTarget;
      if (!target) return recordAndReturn(command, { success: false, message: "I couldn't tell which page to open." });

      const route = REAL_ROUTES[target];
      if (!route) {
        return recordAndReturn(command, {
          success: false,
          message: `${command.label?.replace(/^Open /, "") ?? target} doesn't have its own page yet.`,
        });
      }
      if (!bridge.navigate) return recordAndReturn(command, { success: false, message: "Navigation isn't available right now." });

      bridge.navigate(route);
      return recordAndReturn(command, { success: true, message: `${command.label?.replace(/^Open /, "Opened ") ?? "Opened"}.` });
    }

    case "query-last-action": {
      const last = useActionHistoryStore.getState().getLast();
      return {
        success: true,
        message: last ? `Your last action was: ${last.label}${last.success ? "" : " (failed)"}.` : "No actions have been taken yet this session.",
      };
    }

    // Mission Planning & Flight Operations. Every handler
    // below calls the Mission Store (and, for locate-mission, the SAME
    // `bridge.digitalTwin.focusPlot` capability "Focus Plot" already uses)
    // directly — no backend, no Gemini round-trip, exactly like every other
    // actionable command above.
    // "Create a drone mission" was historically a separate, never-wired
    // stub commandId (kept apart only so its pattern couldn't shadow this
    // one's — see command-parser.ts). Both now compute identical params and
    // share this one real handler.
    case "create-mission":
    case "create-drone-mission": {
      const requestedType = command.params?.missionType;
      const missionType: MissionType = MISSION_TYPES.includes(requestedType as MissionType) ? (requestedType as MissionType) : "survey";
      const plotId = command.params?.plotId;
      const plotLabel = plotId ? plotLabelFromId(plotId) : null;
      const name = plotLabel ? `${plotLabel} ${MISSION_TYPE_LABELS[missionType]}` : `${MISSION_TYPE_LABELS[missionType]} Mission`;

      const mission = useMissionStore.getState().createMission({ name, missionType, targetPlotId: plotId ?? null });
      return recordAndReturn(command, { success: true, message: `Created "${mission.name}".` });
    }

    // Recurring Missions. AURA is never the source of
    // truth for scheduling: this calls the exact same
    // `useRecurringMissionStore.createRecurringMission` the Mission
    // Planner's own "New" form uses (see `recurring-missions-panel.tsx`) —
    // the store/scheduler don't know or care whether a config was created
    // from chat or a click.
    case "create-recurring-mission": {
      const vehicleKind = command.params?.vehicleKind === "robot" ? "robot" : "drone";
      const intervalMinutes = command.params?.intervalMinutes ?? 10;
      const plotIdParam = command.params?.plotId;
      const plotLabel = plotIdParam ? plotLabelFromId(plotIdParam) : null;

      if (vehicleKind === "drone") {
        const requestedType = command.params?.missionType;
        const missionType: MissionType = MISSION_TYPES.includes(requestedType as MissionType) ? (requestedType as MissionType) : "crop-health";
        const drone = Object.values(useFleetStore.getState().drones)[0];
        if (!drone) return recordAndReturn(command, { success: false, message: "No drones are available to assign to a recurring mission." });
        const name = plotLabel ? `${plotLabel} ${MISSION_TYPE_LABELS[missionType]}` : `${MISSION_TYPE_LABELS[missionType]} Recurring Mission`;
        const config = useRecurringMissionStore.getState().createRecurringMission({
          name,
          vehicleKind: "drone",
          droneMissionType: missionType,
          targetPlotId: plotIdParam ?? null,
          assignedDroneId: drone.id,
          intervalMinutes,
        });
        return recordAndReturn(command, { success: true, message: `Created recurring mission "${config.name}" — ${drone.name} will run it every ${intervalMinutes} minutes, starting now.` });
      }

      const requestedRobotType = command.params?.missionType;
      const robotMissionType: RobotMissionType = ROBOT_MISSION_TYPES.includes(requestedRobotType as RobotMissionType) ? (requestedRobotType as RobotMissionType) : "crop-inspection";
      const robot = Object.values(useRobotStore.getState().robots)[0];
      if (!robot) return recordAndReturn(command, { success: false, message: "No robots are available to assign to a recurring mission." });
      const robotName = plotLabel ? `${plotLabel} ${ROBOT_MISSION_TYPE_LABELS[robotMissionType]}` : `${ROBOT_MISSION_TYPE_LABELS[robotMissionType]} Recurring Mission`;
      const robotConfig = useRecurringMissionStore.getState().createRecurringMission({
        name: robotName,
        vehicleKind: "robot",
        robotMissionType,
        targetPlotId: plotIdParam ?? null,
        assignedRobotId: robot.id,
        intervalMinutes,
      });
      return recordAndReturn(command, {
        success: true,
        message: `Created recurring mission "${robotConfig.name}" — ${robot.name} will run it every ${intervalMinutes} minutes, starting now.`,
      });
    }

    case "list-recurring-missions": {
      const state = useRecurringMissionStore.getState();
      const configs = state.order.map((id) => state.configs[id]).filter((config): config is RecurringMissionConfig => Boolean(config));
      if (configs.length === 0) return recordAndReturn(command, { success: true, message: "No recurring missions are configured." });
      const lines = configs.map(
        (config) => `${config.name} — every ${config.intervalMinutes} min, ${config.enabled ? (config.activeRunId ? "running now" : "scheduled") : "disabled"}`,
      );
      return recordAndReturn(command, { success: true, message: lines.join("\n") });
    }

    case "stop-recurring-mission": {
      const plotIdParam = command.params?.plotId;
      const configs = Object.values(useRecurringMissionStore.getState().configs);
      const target = plotIdParam ? configs.find((config) => config.targetPlotId === plotIdParam && config.enabled) : configs.find((config) => config.enabled);
      if (!target) return recordAndReturn(command, { success: false, message: "I couldn't find a matching active recurring mission to stop." });
      useRecurringMissionStore.getState().setEnabled(target.id, false);
      return recordAndReturn(command, { success: true, message: `Stopped recurring mission "${target.name}". Any run currently in flight will still finish normally.` });
    }

    // The start/resume counterpart to stop-recurring-mission above.
    case "start-recurring-mission": {
      const plotIdParam = command.params?.plotId;
      const configs = Object.values(useRecurringMissionStore.getState().configs);
      const target = plotIdParam ? configs.find((config) => config.targetPlotId === plotIdParam && !config.enabled) : configs.find((config) => !config.enabled);
      if (!target) return recordAndReturn(command, { success: false, message: "I couldn't find a matching disabled recurring mission to start." });
      useRecurringMissionStore.getState().setEnabled(target.id, true);
      return recordAndReturn(command, { success: true, message: `Started recurring mission "${target.name}" — it will run again on schedule.` });
    }

    // Global autonomous-behavior toggles. Each calls the
    // SAME orchestration function the Mission Planner's own toggle UI calls
    // (`lib/autonomous/autonomous-behavior.ts`), never the Fleet/Robot
    // Store's raw setter directly, so an AURA-triggered toggle takes
    // effect immediately (the same reconciliation sweep the UI gets) and
    // AI-generated text never bypasses that one real mechanism.
    case "enable-drone-autonomous": {
      setDroneAutonomousEnabled(true);
      return recordAndReturn(command, {
        success: true,
        message: "Drone autonomous behavior is now ON — an idle drone with no active or recurring mission will patrol the farm on its own.",
      });
    }
    case "disable-drone-autonomous": {
      setDroneAutonomousEnabled(false);
      return recordAndReturn(command, {
        success: true,
        message: "Drone autonomous behavior is now OFF — an idle drone will stay home until it's given a mission.",
      });
    }
    case "enable-robot-autonomous": {
      setRobotAutonomousEnabled(true);
      return recordAndReturn(command, {
        success: true,
        message: "Robot autonomous behavior is now ON — an idle robot with no active or recurring mission will patrol the farm on its own.",
      });
    }
    case "disable-robot-autonomous": {
      setRobotAutonomousEnabled(false);
      return recordAndReturn(command, {
        success: true,
        message: "Robot autonomous behavior is now OFF — an idle robot will stay home until it's given a mission.",
      });
    }
    case "show-autonomous-status": {
      const droneOn = useFleetStore.getState().autonomousEnabled;
      const robotOn = useRobotStore.getState().autonomousEnabled;
      return recordAndReturn(command, {
        success: true,
        message: `Drone autonomous behavior: ${droneOn ? "ON" : "OFF"}. Robot autonomous behavior: ${robotOn ? "ON" : "OFF"}.`,
      });
    }

    case "assign-drone-to-mission": {
      const droneName = command.params?.unitName;
      if (!droneName) return recordAndReturn(command, { success: false, message: "I couldn't tell which drone to assign." });
      const drone = findDroneByName(droneName);
      if (!drone) return recordAndReturn(command, { success: false, message: `There's no drone named "${droneName}" in the fleet.` });

      const mission = resolveMission(undefined);
      if (!mission) return recordAndReturn(command, { success: false, message: "No mission is selected to assign a drone to." });

      useMissionStore.getState().assignDrone(mission.id, drone.id);
      return recordAndReturn(command, { success: true, message: `${drone.name} assigned to "${mission.name}".` });
    }

    case "start-mission": {
      const mission = resolveMission(command.params?.missionName);
      if (!mission) return recordAndReturn(command, { success: false, message: "I couldn't tell which mission to start." });
      if (!mission.assignedDroneId) return recordAndReturn(command, { success: false, message: `"${mission.name}" has no drone assigned yet.` });

      if (mission.waypoints.length === 0 && !useMissionStore.getState().generatePath(mission.id)) {
        return recordAndReturn(command, { success: false, message: `Couldn't generate a flight path for "${mission.name}".` });
      }

      const ok = useMissionStore.getState().startMission(mission.id);
      return recordAndReturn(
        command,
        ok ? { success: true, message: `Started "${mission.name}".` } : { success: false, message: `"${mission.name}" couldn't be started.` },
      );
    }

    case "pause-mission": {
      const mission = resolveMission(command.params?.missionName);
      if (mission) {
        if (!MISSION_FLIGHT_STATUSES.includes(mission.status)) {
          return recordAndReturn(command, { success: false, message: `"${mission.name}" isn't currently in flight.` });
        }
        return recordAndReturn(command, await pauseMissionById("drone", mission.id, userRole));
      }
      // Fallback when nothing is named/selected on the drone side; AURA's
      // own conversational context, then a farm-wide unambiguous check
      // (across BOTH vehicle kinds), before ever asking or giving up. See
      // `resolveActiveMissionAcrossStores`'s own doc comment.
      const { match, candidates, invalidRecentMatch } = resolveActiveMissionAcrossStores("pause", command.params?.recentMissionRefs);
      if (match) return recordAndReturn(command, await pauseMissionById(match.vehicleKind, match.mission.id, userRole));
      if (candidates.length > 1) return recordAndReturn(command, { success: false, message: clarifyMissionMessage("pause", candidates) });
      return recordAndReturn(command, { success: false, message: command.params?.missionName ? "I couldn't tell which mission to pause." : noMissionOrWhyNot("pause", invalidRecentMatch) });
    }

    case "resume-mission": {
      const mission = resolveMission(command.params?.missionName);
      if (mission) {
        if (mission.status !== "paused") return recordAndReturn(command, { success: false, message: `"${mission.name}" isn't paused.` });
        return recordAndReturn(command, await resumeMissionById("drone", mission.id, userRole));
      }
      const { match, candidates, invalidRecentMatch } = resolveActiveMissionAcrossStores("resume", command.params?.recentMissionRefs);
      if (match) return recordAndReturn(command, await resumeMissionById(match.vehicleKind, match.mission.id, userRole));
      if (candidates.length > 1) return recordAndReturn(command, { success: false, message: clarifyMissionMessage("resume", candidates) });
      return recordAndReturn(command, { success: false, message: command.params?.missionName ? "I couldn't tell which mission to resume." : noMissionOrWhyNot("resume", invalidRecentMatch) });
    }

    case "cancel-mission": {
      const mission = resolveMission(command.params?.missionName);
      if (mission) {
        if (mission.status === "completed" || mission.status === "cancelled") {
          return recordAndReturn(command, { success: false, message: `"${mission.name}" is already ${mission.status}.` });
        }
        // Cancellation now always requires an explicit
        // confirmation, same as every other consequential AURA action; see
        // `proposeMissionCancel`'s own doc comment.
        return recordAndReturn(command, proposeMissionCancel({ vehicleKind: "drone", mission }));
      }
      const { match, candidates, invalidRecentMatch } = resolveActiveMissionAcrossStores("cancel", command.params?.recentMissionRefs);
      if (match) return recordAndReturn(command, proposeMissionCancel(match));
      if (candidates.length > 1) return recordAndReturn(command, { success: false, message: clarifyMissionMessage("cancel", candidates) });
      return recordAndReturn(command, { success: false, message: command.params?.missionName ? "I couldn't tell which mission to cancel." : noMissionOrWhyNot("cancel", invalidRecentMatch) });
    }

    case "delete-mission": {
      const mission = resolveMission(command.params?.missionName);
      if (!mission) return recordAndReturn(command, { success: false, message: "I couldn't tell which mission to delete." });
      useMissionStore.getState().deleteMission(mission.id);
      return recordAndReturn(command, { success: true, message: `Deleted "${mission.name}".` });
    }

    case "duplicate-mission": {
      const mission = resolveMission(command.params?.missionName);
      if (!mission) return recordAndReturn(command, { success: false, message: "I couldn't tell which mission to duplicate." });
      const copy = useMissionStore.getState().duplicateMission(mission.id);
      return recordAndReturn(
        command,
        copy ? { success: true, message: `Duplicated as "${copy.name}".` } : { success: false, message: "Couldn't duplicate that mission." },
      );
    }

    case "show-active-missions": {
      const active = Object.values(useMissionStore.getState().missions).filter((mission) => MISSION_FLIGHT_STATUSES.includes(mission.status));
      if (active.length === 0) return { success: true, message: "No missions are currently active." };
      const lines = active.map((mission) => `${mission.name} — ${MISSION_STATUS_LABELS[mission.status]}, ${Math.round(mission.progressPercent)}% complete`);
      return { success: true, message: lines.join("\n") };
    }

    // The drone-side equivalent of "list-robot-missions"
    // below, which already existed; mirrors it field-for-field.
    case "list-missions": {
      const all = Object.values(useMissionStore.getState().missions);
      if (all.length === 0) return { success: true, message: "There are no drone missions yet." };
      const lines = all.map((mission) => `${mission.name} — ${MISSION_STATUS_LABELS[mission.status]}, ${Math.round(mission.progressPercent)}% complete`);
      return { success: true, message: lines.join("\n") };
    }

    case "locate-mission": {
      const mission = resolveMission(command.params?.missionName);
      if (!mission) return recordAndReturn(command, { success: false, message: "I couldn't tell which mission to locate." });
      if (!mission.targetPlotId) return recordAndReturn(command, { success: false, message: `"${mission.name}" has no target plot to focus on.` });
      if (!bridge.digitalTwin) return recordAndReturn(command, { success: false, message: NEEDS_DIGITAL_TWIN });

      const ok = bridge.digitalTwin.focusPlot(mission.targetPlotId);
      return recordAndReturn(
        command,
        ok
          ? { success: true, message: `Camera focused on ${mission.name}'s target plot.` }
          : { success: false, message: `Couldn't focus on "${mission.name}"'s plot.` },
      );
    }

    case "mission-status": {
      const mission = resolveMission(command.params?.missionName);
      if (!mission) return { success: false, message: "I couldn't tell which mission you mean." };
      return { success: true, message: `"${mission.name}" is ${MISSION_STATUS_LABELS[mission.status]}.` };
    }

    case "mission-progress": {
      const mission = resolveMission(command.params?.missionName);
      if (!mission) return { success: false, message: "I couldn't tell which mission you mean." };
      return { success: true, message: `"${mission.name}" is ${Math.round(mission.progressPercent)}% complete.` };
    }

    case "mission-eta": {
      const mission = resolveMission(command.params?.missionName);
      if (!mission) return { success: false, message: "I couldn't tell which mission you mean." };
      if (!mission.estimate) return { success: true, message: `"${mission.name}" has no estimate yet — generate a flight path first.` };
      const remainingMinutes = Math.max(0, mission.estimate.durationMinutes * (1 - mission.progressPercent / 100));
      return { success: true, message: `"${mission.name}" has an estimated ${remainingMinutes.toFixed(1)} min remaining.` };
    }

    case "mission-battery": {
      const mission = resolveMission(command.params?.missionName);
      if (!mission) return { success: false, message: "I couldn't tell which mission you mean." };
      if (!mission.estimate) return { success: true, message: `"${mission.name}" has no battery estimate yet — generate a flight path first.` };
      return { success: true, message: `"${mission.name}" is estimated to use ${mission.estimate.batteryPercent}% battery.` };
    }

    // Ground Robot Fleet Management. Every handler below calls
    // the Robot Store directly — no backend, no Gemini round-trip, exactly
    // like every drone/mission handler above.
    case "pause-robot": {
      const robot = resolveRobot(command.params?.unitName);
      if (!robot) return recordAndReturn(command, { success: false, message: "I couldn't tell which robot to pause." });
      if (!ROBOT_MOVING_STATUSES.includes(robot.status)) {
        return recordAndReturn(command, { success: false, message: `${robot.name} isn't currently moving.` });
      }
      useRobotStore.getState().pauseRobot(robot.id);
      return recordAndReturn(command, { success: true, message: `Paused ${robot.name}.` });
    }

    case "resume-robot": {
      const robot = resolveRobot(command.params?.unitName);
      if (!robot) return recordAndReturn(command, { success: false, message: "I couldn't tell which robot to resume." });
      if (!["paused", "charging", "idle"].includes(robot.status)) {
        return recordAndReturn(command, { success: false, message: `${robot.name} isn't paused, charging, or idle.` });
      }
      useRobotStore.getState().resumeRobot(robot.id);
      return recordAndReturn(command, { success: true, message: `Resumed ${robot.name}.` });
    }

    case "send-robot-home": {
      const robot = resolveRobot(command.params?.unitName);
      if (!robot) return recordAndReturn(command, { success: false, message: "I couldn't tell which robot to send home." });
      if (robot.status === "returning" || robot.status === "charging") {
        return recordAndReturn(command, { success: false, message: `${robot.name} is already ${ROBOT_STATUS_LABELS[robot.status].toLowerCase()}.` });
      }
      useRobotStore.getState().sendRobotHome(robot.id);
      return recordAndReturn(command, { success: true, message: `${robot.name} is heading home.` });
    }

    case "maintenance-mode-robot": {
      const robot = resolveRobot(command.params?.unitName);
      if (!robot) return recordAndReturn(command, { success: false, message: "I couldn't tell which robot you mean." });
      const enabled = command.params?.maintenanceEnabled ?? true;
      useRobotStore.getState().setMaintenanceMode(robot.id, enabled);
      return recordAndReturn(command, {
        success: true,
        message: `${enabled ? "Enabled" : "Disabled"} maintenance mode for ${robot.name}.`,
      });
    }

    case "assign-robot": {
      const robot = resolveRobot(command.params?.unitName);
      if (!robot) return recordAndReturn(command, { success: false, message: "I couldn't tell which robot to assign." });
      useRobotStore.getState().assignMission(robot.id, { label: "Field Mission", targetPlotId: null });
      return recordAndReturn(command, { success: true, message: `${robot.name} assigned to a field mission.` });
    }

    case "robot-status": {
      const robot = resolveRobot(command.params?.unitName);
      if (!robot) return { success: false, message: "I couldn't tell which robot you mean." };
      return { success: true, message: `${robot.name} is ${ROBOT_STATUS_LABELS[robot.status]}.` };
    }

    case "robot-battery": {
      const robot = resolveRobot(command.params?.unitName);
      if (!robot) return { success: false, message: "I couldn't tell which robot you mean." };
      return { success: true, message: `${robot.name} is at ${robot.batteryPercent}% battery.` };
    }

    case "robot-location": {
      const robot = resolveRobot(command.params?.unitName);
      if (!robot) return { success: false, message: "I couldn't tell which robot you mean." };
      return {
        success: true,
        message: `${robot.name} is at x=${robot.position[0].toFixed(1)}, z=${robot.position[1].toFixed(1)} (scene coordinates).`,
      };
    }

    case "robot-health": {
      const robot = resolveRobot(command.params?.unitName);
      if (!robot) return { success: false, message: "I couldn't tell which robot you mean." };
      return {
        success: true,
        message: `${robot.name} health is ${robot.health}. Motor: ${robot.motorHealth}, Wheels: ${robot.wheelHealth}, Connection: ${CONNECTION_QUALITY_LABELS[robot.connectionQuality]}.`,
      };
    }

    case "show-active-robots": {
      const active = Object.values(useRobotStore.getState().robots).filter((robot) => ROBOT_MOVING_STATUSES.includes(robot.status));
      if (active.length === 0) return { success: true, message: "No robots are currently active." };
      const lines = active.map((robot) => `${robot.name} — ${ROBOT_STATUS_LABELS[robot.status]}, ${robot.batteryPercent}% battery`);
      return { success: true, message: lines.join("\n") };
    }

    case "list-robots": {
      const all = Object.values(useRobotStore.getState().robots);
      if (all.length === 0) return { success: true, message: "There are no robots in the fleet." };
      const lines = all.map((robot) => `${robot.name} — ${ROBOT_STATUS_LABELS[robot.status]}, ${robot.batteryPercent}% battery`);
      return { success: true, message: lines.join("\n") };
    }

    // Deterministic "List Drones", mirroring "list-robots"
    // exactly. Real Fleet Store data only — never fabricated names,
    // batteries, or statuses.
    case "list-drones": {
      const all = Object.values(useFleetStore.getState().drones);
      if (all.length === 0) return { success: true, message: "There are no drones in the fleet." };
      const lines = all.map((drone) => `${drone.name} — ${DRONE_STATUS_LABELS[drone.status]}, ${drone.batteryPercent}% battery`);
      return { success: true, message: lines.join("\n") };
    }

    // Ground Robot Mission Planner. Every handler below calls
    // the Robot Mission Store (and, for locate-robot-mission, the SAME
    // `bridge.digitalTwin.focusPlot` capability "Focus Plot"/"Locate Mission"
    // already use) directly — no backend, no Gemini round-trip, mirroring
    // every drone Mission handler above field-for-field.
    case "create-robot-mission": {
      const requestedType = command.params?.missionType;
      const missionType: RobotMissionType = ROBOT_MISSION_TYPES.includes(requestedType as RobotMissionType)
        ? (requestedType as RobotMissionType)
        : "crop-inspection";
      const plotId = command.params?.plotId;
      const plotLabel = plotId ? plotLabelFromId(plotId) : null;
      const name = plotLabel ? `${plotLabel} ${ROBOT_MISSION_TYPE_LABELS[missionType]}` : `${ROBOT_MISSION_TYPE_LABELS[missionType]} Robot Mission`;

      const mission = useRobotMissionStore.getState().createMission({ name, missionType, targetPlotId: plotId ?? null });
      return recordAndReturn(command, { success: true, message: `Created "${mission.name}".` });
    }

    case "assign-robot-to-mission": {
      const robotName = command.params?.unitName;
      if (!robotName) return recordAndReturn(command, { success: false, message: "I couldn't tell which robot to assign." });
      const robot = resolveRobot(robotName);
      if (!robot) return recordAndReturn(command, { success: false, message: `There's no robot named "${robotName}" in the fleet.` });

      const mission = resolveRobotMission(undefined);
      if (!mission) return recordAndReturn(command, { success: false, message: "No robot mission is selected to assign a robot to." });

      useRobotMissionStore.getState().assignRobot(mission.id, robot.id);
      return recordAndReturn(command, { success: true, message: `${robot.name} assigned to "${mission.name}".` });
    }

    case "start-robot-mission": {
      const mission = resolveRobotMission(command.params?.missionName);
      if (!mission) return recordAndReturn(command, { success: false, message: "I couldn't tell which robot mission to start." });
      if (!mission.assignedRobotId) return recordAndReturn(command, { success: false, message: `"${mission.name}" has no robot assigned yet.` });

      if (mission.waypoints.length === 0 && !useRobotMissionStore.getState().generateRoute(mission.id)) {
        return recordAndReturn(command, { success: false, message: `Couldn't generate a ground route for "${mission.name}".` });
      }

      const ok = useRobotMissionStore.getState().startMission(mission.id);
      return recordAndReturn(
        command,
        ok ? { success: true, message: `Started "${mission.name}".` } : { success: false, message: `"${mission.name}" couldn't be started.` },
      );
    }

    case "pause-robot-mission": {
      const mission = resolveRobotMission(command.params?.missionName);
      if (mission) {
        if (!ROBOT_MISSION_ACTIVE_STATUSES.includes(mission.status)) {
          return recordAndReturn(command, { success: false, message: `"${mission.name}" isn't currently in progress.` });
        }
        return recordAndReturn(command, await pauseMissionById("robot", mission.id, userRole));
      }
      const { match, candidates, invalidRecentMatch } = resolveActiveMissionAcrossStores("pause", command.params?.recentMissionRefs);
      if (match) return recordAndReturn(command, await pauseMissionById(match.vehicleKind, match.mission.id, userRole));
      if (candidates.length > 1) return recordAndReturn(command, { success: false, message: clarifyMissionMessage("pause", candidates) });
      return recordAndReturn(command, { success: false, message: command.params?.missionName ? "I couldn't tell which robot mission to pause." : noMissionOrWhyNot("pause", invalidRecentMatch) });
    }

    case "resume-robot-mission": {
      const mission = resolveRobotMission(command.params?.missionName);
      if (mission) {
        if (mission.status !== "paused") return recordAndReturn(command, { success: false, message: `"${mission.name}" isn't paused.` });
        return recordAndReturn(command, await resumeMissionById("robot", mission.id, userRole));
      }
      const { match, candidates, invalidRecentMatch } = resolveActiveMissionAcrossStores("resume", command.params?.recentMissionRefs);
      if (match) return recordAndReturn(command, await resumeMissionById(match.vehicleKind, match.mission.id, userRole));
      if (candidates.length > 1) return recordAndReturn(command, { success: false, message: clarifyMissionMessage("resume", candidates) });
      return recordAndReturn(command, { success: false, message: command.params?.missionName ? "I couldn't tell which robot mission to resume." : noMissionOrWhyNot("resume", invalidRecentMatch) });
    }

    case "cancel-robot-mission": {
      const mission = resolveRobotMission(command.params?.missionName);
      if (mission) {
        if (mission.status === "completed" || mission.status === "cancelled") {
          return recordAndReturn(command, { success: false, message: `"${mission.name}" is already ${mission.status}.` });
        }
        return recordAndReturn(command, proposeMissionCancel({ vehicleKind: "robot", mission }));
      }
      const { match, candidates, invalidRecentMatch } = resolveActiveMissionAcrossStores("cancel", command.params?.recentMissionRefs);
      if (match) return recordAndReturn(command, proposeMissionCancel(match));
      if (candidates.length > 1) return recordAndReturn(command, { success: false, message: clarifyMissionMessage("cancel", candidates) });
      return recordAndReturn(command, { success: false, message: command.params?.missionName ? "I couldn't tell which robot mission to cancel." : noMissionOrWhyNot("cancel", invalidRecentMatch) });
    }

    case "delete-robot-mission": {
      const mission = resolveRobotMission(command.params?.missionName);
      if (!mission) return recordAndReturn(command, { success: false, message: "I couldn't tell which robot mission to delete." });
      useRobotMissionStore.getState().deleteMission(mission.id);
      return recordAndReturn(command, { success: true, message: `Deleted "${mission.name}".` });
    }

    case "duplicate-robot-mission": {
      const mission = resolveRobotMission(command.params?.missionName);
      if (!mission) return recordAndReturn(command, { success: false, message: "I couldn't tell which robot mission to duplicate." });
      const copy = useRobotMissionStore.getState().duplicateMission(mission.id);
      return recordAndReturn(
        command,
        copy ? { success: true, message: `Duplicated as "${copy.name}".` } : { success: false, message: "Couldn't duplicate that robot mission." },
      );
    }

    case "show-active-robot-missions": {
      const active = Object.values(useRobotMissionStore.getState().missions).filter((mission) => ROBOT_MISSION_ACTIVE_STATUSES.includes(mission.status));
      if (active.length === 0) return { success: true, message: "No robot missions are currently active." };
      const lines = active.map((mission) => `${mission.name} — ${ROBOT_MISSION_STATUS_LABELS[mission.status]}, ${Math.round(mission.progressPercent)}% complete`);
      return { success: true, message: lines.join("\n") };
    }

    case "list-robot-missions": {
      const all = Object.values(useRobotMissionStore.getState().missions);
      if (all.length === 0) return { success: true, message: "There are no robot missions yet." };
      const lines = all.map((mission) => `${mission.name} — ${ROBOT_MISSION_STATUS_LABELS[mission.status]}, ${Math.round(mission.progressPercent)}% complete`);
      return { success: true, message: lines.join("\n") };
    }

    case "locate-robot-mission": {
      const mission = resolveRobotMission(command.params?.missionName);
      if (!mission) return recordAndReturn(command, { success: false, message: "I couldn't tell which robot mission to locate." });
      if (!mission.targetPlotId) return recordAndReturn(command, { success: false, message: `"${mission.name}" has no target plot to focus on.` });
      if (!bridge.digitalTwin) return recordAndReturn(command, { success: false, message: NEEDS_DIGITAL_TWIN });

      const ok = bridge.digitalTwin.focusPlot(mission.targetPlotId);
      return recordAndReturn(
        command,
        ok
          ? { success: true, message: `Camera focused on ${mission.name}'s target plot.` }
          : { success: false, message: `Couldn't focus on "${mission.name}"'s plot.` },
      );
    }

    case "robot-mission-status": {
      const mission = resolveRobotMission(command.params?.missionName);
      if (!mission) return { success: false, message: "I couldn't tell which robot mission you mean." };
      return { success: true, message: `"${mission.name}" is ${ROBOT_MISSION_STATUS_LABELS[mission.status]}.` };
    }

    case "robot-mission-progress": {
      const mission = resolveRobotMission(command.params?.missionName);
      if (!mission) return { success: false, message: "I couldn't tell which robot mission you mean." };
      return { success: true, message: `"${mission.name}" is ${Math.round(mission.progressPercent)}% complete.` };
    }

    case "robot-mission-eta": {
      const mission = resolveRobotMission(command.params?.missionName);
      if (!mission) return { success: false, message: "I couldn't tell which robot mission you mean." };
      if (!mission.estimate) return { success: true, message: `"${mission.name}" has no estimate yet — generate a ground route first.` };
      const remainingMinutes = Math.max(0, mission.estimate.durationMinutes * (1 - mission.progressPercent / 100));
      return { success: true, message: `"${mission.name}" has an estimated ${remainingMinutes.toFixed(1)} min remaining.` };
    }

    case "robot-mission-battery": {
      const mission = resolveRobotMission(command.params?.missionName);
      if (!mission) return { success: false, message: "I couldn't tell which robot mission you mean." };
      if (!mission.estimate) return { success: true, message: `"${mission.name}" has no battery estimate yet — generate a ground route first.` };
      return { success: true, message: `"${mission.name}" is estimated to use ${mission.estimate.batteryPercent}% battery.` };
    }

    // Smart Sensor Network. Every handler below calls the
    // Sensor Store directly — no backend, no Gemini round-trip, exactly like
    // every drone/robot/mission handler above.
    case "locate-sensor":
    case "show-sensor": {
      const sensor = resolveSensorByQuery(command.params?.unitName);
      if (!sensor) {
        return recordAndReturn(command, { success: false, message: "I couldn't tell which sensor you mean." });
      }
      if (!bridge.digitalTwin) return recordAndReturn(command, { success: false, message: NEEDS_DIGITAL_TWIN });

      const ok = bridge.digitalTwin.locateSensor(sensor.id);
      return recordAndReturn(
        command,
        ok
          ? { success: true, message: `Camera focused on ${sensor.name}.` }
          : { success: false, message: `${sensor.name} isn't currently visible in the Digital Twin.` },
      );
    }

    case "sensor-status": {
      const sensor = resolveSensorByQuery(command.params?.unitName);
      if (!sensor) return { success: false, message: "I couldn't tell which sensor you mean." };
      return { success: true, message: `${sensor.name} is ${SENSOR_STATUS_LABELS[sensor.status]}.` };
    }

    case "sensor-battery": {
      const sensor = resolveSensorByQuery(command.params?.unitName);
      if (!sensor) return { success: false, message: "I couldn't tell which sensor you mean." };
      return { success: true, message: `${sensor.name} is at ${sensor.batteryPercent}% battery.` };
    }

    case "sensor-reading": {
      const sensor = resolveSensorByQuery(command.params?.unitName);
      if (!sensor) return { success: false, message: "I couldn't tell which sensor you mean." };
      return { success: true, message: `${sensor.name} is reading ${formatSensorReading(sensor)}.` };
    }

    case "sensor-health": {
      const sensor = resolveSensorByQuery(command.params?.unitName);
      if (!sensor) return { success: false, message: "I couldn't tell which sensor you mean." };
      const plotLabel = sensorPlotLabel(sensor);
      return {
        success: true,
        message: `${sensor.name} health is ${sensor.health} (status: ${SENSOR_STATUS_LABELS[sensor.status]}${plotLabel ? `, plot: ${plotLabel}` : ""}).`,
      };
    }

    case "list-sensors": {
      const all = Object.values(useSensorStore.getState().sensors);
      if (all.length === 0) return { success: true, message: "There are no sensors in the network." };
      const lines = all.map((sensor) => `${sensor.name} — ${SENSOR_STATUS_LABELS[sensor.status]}, ${formatSensorReading(sensor)}, ${sensor.batteryPercent}% battery`);
      return { success: true, message: lines.join("\n") };
    }

    case "show-offline-sensors": {
      const offline = Object.values(useSensorStore.getState().sensors).filter((sensor) => sensor.status === "offline");
      if (offline.length === 0) return { success: true, message: "No sensors are currently offline." };
      const lines = offline.map((sensor) => `${sensor.name} — offline since ${new Date(sensor.lastUpdatedAt).toLocaleTimeString()}`);
      return { success: true, message: lines.join("\n") };
    }

    case "show-critical-sensors": {
      const critical = Object.values(useSensorStore.getState().sensors).filter((sensor) => sensor.status === "critical");
      if (critical.length === 0) return { success: true, message: "No sensors are currently critical." };
      const lines = critical.map((sensor) => `${sensor.name} — ${formatSensorReading(sensor)}, ${sensor.batteryPercent}% battery`);
      return { success: true, message: lines.join("\n") };
    }

    // Plot Comparison. Reuses the existing Agricultural
    // Reasoning Engine (`getPlotRecommendation`) and the existing (previously
    // dead-code) `getPlotSensorAnalyticsSnapshot` — no new comparison
    // subsystem, no new store, no fabricated measurement: every metric below
    // is either a real per-plot sensor average or an honest "unavailable"
    // when this plot has no sensor of that type.
    case "compare-plots": {
      const plotAId = command.params?.plotId;
      const plotBId = command.params?.secondaryPlotId;
      if (!plotAId || !plotBId) {
        return recordAndReturn(command, { success: false, message: "I couldn't tell which two plots to compare." });
      }

      const recA = getPlotRecommendation(plotAId);
      const recB = getPlotRecommendation(plotBId);
      const snapA = getPlotSensorAnalyticsSnapshot(plotAId);
      const snapB = getPlotSensorAnalyticsSnapshot(plotBId);

      const metricLine = (label: string, a: number | null, b: number | null, unit: string) =>
        `${label}: ${recA.plotLabel} ${a !== null ? `${a.toFixed(1)}${unit}` : "unavailable"} vs ${recB.plotLabel} ${b !== null ? `${b.toFixed(1)}${unit}` : "unavailable"}.`;

      return recordAndReturn(command, {
        success: true,
        message: [
          `Comparing ${recA.plotLabel} and ${recB.plotLabel}`,
          "",
          metricLine("Soil moisture", snapA.averageSoilMoisture, snapB.averageSoilMoisture, "%"),
          metricLine("Temperature", snapA.averageTemperature, snapB.averageTemperature, "°"),
          `Critical sensors: ${recA.plotLabel} ${snapA.criticalSensorCount} vs ${recB.plotLabel} ${snapB.criticalSensorCount}.`,
          "",
          `${recA.plotLabel} recommendation: ${capitalize(recA.action)}${recA.confidence ? ` (${recA.confidence} confidence)` : ""} — ${recA.reason}`,
          `${recB.plotLabel} recommendation: ${capitalize(recB.action)}${recB.confidence ? ` (${recB.confidence} confidence)` : ""} — ${recB.reason}`,
        ].join("\n"),
      });
    }

    // Sensor Analytics & Historical Intelligence. Every
    // handler below reads the Historical/Threshold/Alert stores directly —
    // no backend, no Gemini round-trip, mirroring every handler above.
    case "compare-sensors": {
      const nameA = command.params?.unitName;
      const nameB = command.params?.secondaryUnitName;
      if (!nameA || !nameB) return recordAndReturn(command, { success: false, message: "I couldn't tell which two sensors to compare." });
      const sensorA = resolveSensorByQuery(nameA);
      const sensorB = resolveSensorByQuery(nameB);
      if (!sensorA || !sensorB) {
        return recordAndReturn(command, { success: false, message: `I couldn't find ${!sensorA ? `"${nameA}"` : `"${nameB}"`} in the sensor network.` });
      }
      const { rangeMs, rangeLabel } = resolveTimeRangeMs(command.params?.timeRangeId);
      const trendA = computeTrendStats(filterSamplesByRange(useHistoricalStore.getState().samples[sensorA.id] ?? [], rangeMs));
      const trendB = computeTrendStats(filterSamplesByRange(useHistoricalStore.getState().samples[sensorB.id] ?? [], rangeMs));
      return recordAndReturn(command, {
        success: true,
        message: [
          `${rangeLabel}:`,
          `${sensorA.name}: ${formatSensorReading(sensorA)}, ${trendA.direction} (${trendA.strength}).`,
          `${sensorB.name}: ${formatSensorReading(sensorB)}, ${trendB.direction} (${trendB.strength}).`,
        ].join("\n"),
      });
    }

    case "show-sensor-alerts": {
      const active = Object.values(useAlertStore.getState().alerts).filter((alert) => alert.resolvedAt === null);
      if (active.length === 0) return { success: true, message: "No active sensor alerts." };
      const lines = active.map((alert) => `${ALERT_TYPE_LABELS[alert.alertType]} — ${alert.message}`);
      return { success: true, message: lines.join("\n") };
    }

    case "show-heatmap": {
      const query = command.params?.unitName;
      const match = query ? matchHeatmapQuery(query) : null;
      if (!match) return recordAndReturn(command, { success: false, message: "I couldn't tell which heatmap to show — try soil moisture, temperature, humidity, pH, EC, or NPK." });
      if (!bridge.digitalTwin) return recordAndReturn(command, { success: false, message: NEEDS_DIGITAL_TWIN });

      const ok = bridge.digitalTwin.setLayer(match.layerKey, true);
      return recordAndReturn(command, ok ? { success: true, message: `${match.label} heatmap enabled.` } : { success: false, message: `Couldn't enable the ${match.label} heatmap.` });
    }

    case "show-soil-moisture-trend":
    case "show-temperature-trend": {
      const types: SensorType[] = commandId === "show-soil-moisture-trend" ? ["soil-moisture"] : ["soil-temperature", "air-temperature"];
      const matching = Object.values(useSensorStore.getState().sensors).filter((sensor) => types.includes(sensor.sensorType));
      if (matching.length === 0) return { success: true, message: "No matching sensors in the network yet." };
      const { rangeMs, rangeLabel } = resolveTimeRangeMs(command.params?.timeRangeId);
      const lines = matching.map((sensor) => {
        const trend = computeTrendStats(filterSamplesByRange(useHistoricalStore.getState().samples[sensor.id] ?? [], rangeMs));
        return `${sensor.name}: ${formatSensorReading(sensor)}, ${trend.direction} (${trend.strength}), ${trend.rateOfChange >= 0 ? "+" : ""}${trend.rateOfChange.toFixed(2)}/hr`;
      });
      return { success: true, message: [`${rangeLabel}:`, ...lines].join("\n") };
    }

    case "sensor-trend": {
      const sensor = resolveSensorByQuery(command.params?.unitName);
      if (!sensor) return { success: false, message: "I couldn't tell which sensor you mean." };
      const { rangeMs, rangeLabel } = resolveTimeRangeMs(command.params?.timeRangeId);
      const trend = computeTrendStats(filterSamplesByRange(useHistoricalStore.getState().samples[sensor.id] ?? [], rangeMs));
      return {
        success: true,
        message: `${sensor.name} is ${trend.direction} (${trend.strength}) over ${rangeLabel.toLowerCase()}, changing ${trend.rateOfChange >= 0 ? "+" : ""}${trend.rateOfChange.toFixed(2)} ${SENSOR_TYPE_META[sensor.sensorType].unit}/hr.`,
      };
    }

    case "sensor-statistics": {
      const sensor = resolveSensorByQuery(command.params?.unitName);
      if (!sensor) return { success: false, message: "I couldn't tell which sensor you mean." };
      const { rangeMs, rangeLabel } = resolveTimeRangeMs(command.params?.timeRangeId);
      const trend = computeTrendStats(filterSamplesByRange(useHistoricalStore.getState().samples[sensor.id] ?? [], rangeMs));
      const unit = SENSOR_TYPE_META[sensor.sensorType].unit;
      return {
        success: true,
        message: `${sensor.name} — ${rangeLabel}: Min ${trend.min.toFixed(1)} ${unit}, Max ${trend.max.toFixed(1)} ${unit}, Avg ${trend.average.toFixed(1)} ${unit}, Std Dev ${trend.standardDeviation.toFixed(2)}.`,
      };
    }

    // Agricultural Reasoning & Sensor-Driven
    // Missions. Every handler below calls `lib/sensor-analytics/reasoning-
    // engine.ts` (via `mission-integration.ts`'s store-reading wrappers)
    // directly — no backend, no LLM round-trip, exactly like every handler
    // above. `create-sensor-mission` is the only handler in this file that
    // can call `useMissionStore`/`useRobotMissionStore`'s `createMission` —
    // every other mission handler above only ever acts on a mission that
    // already exists.
    case "plot-recommendation": {
      const targetPlotId = command.params?.plotId;
      if (!targetPlotId) return { success: false, message: "I couldn't tell which plot you mean." };
      const recommendation = getPlotRecommendation(targetPlotId);
      if (recommendation.action === "unavailable") {
        return { success: true, message: recommendation.reason };
      }
      return {
        success: true,
        message: [
          "Recommendation",
          capitalize(recommendation.action),
          "",
          "Reason",
          recommendation.reason,
          "",
          "Confidence",
          recommendation.confidence ? capitalize(recommendation.confidence) : "Confidence unavailable",
        ].join("\n"),
      };
    }

    case "fields-needing-irrigation": {
      const ranked = getAllPlotRecommendations();
      const lines = ranked.map((recommendation, index) => `${index + 1}. ${recommendation.plotLabel} — ${capitalize(recommendation.action)}: ${recommendation.reason}`);
      return { success: true, message: ["Plots requiring attention (ranked by the Agricultural Reasoning Engine):", ...lines].join("\n") };
    }

    // "Show unhealthy crops" has no separate crop-health-vision concept in
    // this app — the Agricultural Reasoning Engine's "needs inspection"
    // classification (critical/offline sensors, active alerts) is the real,
    // closest equivalent, so this reuses that exact handler rather than
    // inventing a second crop-health computation.
    case "fields-needing-inspection":
    case "show-unhealthy-crops": {
      const needingInspection = getAllPlotRecommendations().filter((recommendation) => recommendation.action === "inspect");
      if (needingInspection.length === 0) return { success: true, message: "No plots currently need inspection." };
      const lines = needingInspection.map((recommendation, index) => `${index + 1}. ${recommendation.plotLabel} — ${recommendation.reason}`);
      return { success: true, message: ["Plots requiring inspection:", ...lines].join("\n") };
    }

    // "Launch an inspection" genuinely has no real equivalent yet — starting
    // an actual inspection mission needs a plot AND a robot chosen, which no
    // existing single command does in one step. Rather than fabricate that
    // (a real new subsystem) or leave it silently falling to the stale
    // not-yet-implemented placeholder text, this gives an honest answer and points at the
    // closest real, working commands.
    case "launch-inspection": {
      return {
        success: false,
        message:
          'Launching an inspection isn\'t a single command yet — try "Which fields need inspection?" to see what needs attention, or "Create a robot mission for Plot A" to start one.',
      };
    }

    case "plot-trend": {
      const targetPlotId = command.params?.plotId;
      if (!targetPlotId) return { success: false, message: "I couldn't tell which plot you mean." };
      const plotSensors = Object.values(useSensorStore.getState().sensors).filter((sensor) => sensor.assignedPlotId === targetPlotId);
      if (plotSensors.length === 0) return { success: true, message: `${plotLabelFromId(targetPlotId)} has no sensors assigned — trend data is unavailable.` };
      const { rangeMs, rangeLabel } = resolveTimeRangeMs(command.params?.timeRangeId);
      const lines = plotSensors.map((sensor) => {
        const samples = filterSamplesByRange(useHistoricalStore.getState().samples[sensor.id] ?? [], rangeMs);
        if (samples.length < 2) return `${sensor.name}: not enough recorded history yet for ${rangeLabel.toLowerCase()}.`;
        const trend = computeTrendStats(samples);
        return `${sensor.name}: ${trend.direction} (${trend.strength}), ${trend.rateOfChange >= 0 ? "+" : ""}${trend.rateOfChange.toFixed(2)} ${SENSOR_TYPE_META[sensor.sensorType].unit}/hr.`;
      });
      return { success: true, message: [`${plotLabelFromId(targetPlotId)} — ${rangeLabel}:`, ...lines].join("\n") };
    }

    case "create-sensor-mission": {
      const requestedPlotId = command.params?.plotId;
      const candidates = requestedPlotId ? [getPlotRecommendation(requestedPlotId)] : getAllPlotRecommendations();
      const target = candidates.find((recommendation) => recommendation.action === "irrigate") ?? candidates.find((recommendation) => recommendation.action === "inspect");

      if (!target) {
        if (requestedPlotId) {
          const only = candidates[0]!;
          return recordAndReturn(command, {
            success: false,
            message:
              only.action === "unavailable"
                ? `I didn't create a mission for ${only.plotLabel} — ${only.reason}`
                : `I didn't create a mission for ${only.plotLabel} — current sensor data doesn't justify one. ${only.reason}`,
          });
        }
        return recordAndReturn(command, { success: false, message: "I didn't create a mission — no plot currently needs irrigation or inspection based on the sensor data." });
      }

      const justification = buildMissionSensorJustification(target.plotId);
      if (!justification) {
        return recordAndReturn(command, { success: false, message: `I couldn't confirm a sensor justification for ${target.plotLabel} — try again.` });
      }

      const confidenceLine = target.confidence ? capitalize(target.confidence) : "Unavailable";
      const sourceLine = target.sourceSensors.length > 0 ? target.sourceSensors.join(", ") : "unavailable";

      if (target.action === "irrigate") {
        const mission = useMissionStore.getState().createMission({
          name: `${target.plotLabel} Irrigation Inspection`,
          missionType: "irrigation-inspection",
          targetPlotId: target.plotId,
          sensorJustification: justification,
        });
        return recordAndReturn(command, {
          success: true,
          message: [
            `I created an irrigation mission for ${target.plotLabel} ("${mission.name}").`,
            "",
            "Reason:",
            target.reason,
            "",
            "Source:",
            sourceLine,
            "",
            "Confidence:",
            confidenceLine,
          ].join("\n"),
        });
      }

      // action === "inspect" — the closest existing operational unit for a
      // ground-level abnormal-condition check is a Robot Mission Planner
      // crop-inspection mission (no drone equivalent maps as directly).
      const mission = useRobotMissionStore.getState().createMission({
        name: `${target.plotLabel} Crop Inspection`,
        missionType: "crop-inspection",
        targetPlotId: target.plotId,
        sensorJustification: justification,
      });
      return recordAndReturn(command, {
        success: true,
        message: [
          `I created an inspection mission for ${target.plotLabel} ("${mission.name}").`,
          "",
          "Reason:",
          target.reason,
          "",
          "Source:",
          sourceLine,
          "",
          "Confidence:",
          confidenceLine,
        ].join("\n"),
      });
    }

    // Reached when `command-parser.ts` recognized a
    // "create/start/stop a mission" phrase with NO "drone"/"robot" word at
    // all, and page context (the parser's own tier) couldn't resolve it
    // either. Tries one more, more concrete tier before actually asking:
    // an already-SELECTED mission is real evidence, not a guess (the exact
    // same fallback `resolveMission`/`resolveRobotMission` already use for
    // every OTHER unnamed mission command), so acting on it here is
    // consistent with how those already behave. Only genuinely falls back
    // to a clarification question when neither tier resolves it — never
    // silently defaults to drone.
    case "clarify-mission-vehicle": {
      const action = command.params?.ambiguousAction;

      if (action === "start" || action === "stop") {
        const droneMission = resolveMission(undefined);
        const robotMission = resolveRobotMission(undefined);

        if (droneMission && !robotMission) {
          if (action === "start") {
            if (!droneMission.assignedDroneId) return recordAndReturn(command, { success: false, message: `"${droneMission.name}" has no drone assigned yet.` });
            if (droneMission.waypoints.length === 0 && !useMissionStore.getState().generatePath(droneMission.id)) {
              return recordAndReturn(command, { success: false, message: `Couldn't generate a flight path for "${droneMission.name}".` });
            }
            const ok = useMissionStore.getState().startMission(droneMission.id);
            return recordAndReturn(
              command,
              ok ? { success: true, message: `Started "${droneMission.name}".` } : { success: false, message: `"${droneMission.name}" couldn't be started.` },
            );
          }
          if (droneMission.status === "completed" || droneMission.status === "cancelled") {
            return recordAndReturn(command, { success: false, message: `"${droneMission.name}" is already ${droneMission.status}.` });
          }
          useMissionStore.getState().cancelMission(droneMission.id);
          return recordAndReturn(command, { success: true, message: `Cancelled "${droneMission.name}".` });
        }

        if (robotMission && !droneMission) {
          if (action === "start") {
            if (!robotMission.assignedRobotId) return recordAndReturn(command, { success: false, message: `"${robotMission.name}" has no robot assigned yet.` });
            if (robotMission.waypoints.length === 0 && !useRobotMissionStore.getState().generateRoute(robotMission.id)) {
              return recordAndReturn(command, { success: false, message: `Couldn't generate a ground route for "${robotMission.name}".` });
            }
            const ok = useRobotMissionStore.getState().startMission(robotMission.id);
            return recordAndReturn(
              command,
              ok ? { success: true, message: `Started "${robotMission.name}".` } : { success: false, message: `"${robotMission.name}" couldn't be started.` },
            );
          }
          if (robotMission.status === "completed" || robotMission.status === "cancelled") {
            return recordAndReturn(command, { success: false, message: `"${robotMission.name}" is already ${robotMission.status}.` });
          }
          useRobotMissionStore.getState().cancelMission(robotMission.id);
          return recordAndReturn(command, { success: true, message: `Cancelled "${robotMission.name}".` });
        }

        // Neither (or both) selected — one more, weaker signal: does only
        // ONE vehicle kind have any missions at all right now?
        const droneHasAny = Object.keys(useMissionStore.getState().missions).length > 0;
        const robotHasAny = Object.keys(useRobotMissionStore.getState().missions).length > 0;
        const verb = action === "start" ? "Start" : "Stop";
        if (droneHasAny && !robotHasAny) {
          return recordAndReturn(command, {
            success: false,
            message: `I'm not sure which mission you mean — try "${verb} the drone mission" (only drone missions exist right now).`,
          });
        }
        if (robotHasAny && !droneHasAny) {
          return recordAndReturn(command, {
            success: false,
            message: `I'm not sure which mission you mean — try "${verb} the robot mission" (only robot missions exist right now).`,
          });
        }

        return recordAndReturn(command, { success: false, message: `Do you want to ${action} the drone mission or the robot mission?` });
      }

      // action === "create" — nothing exists yet to select, so there's no
      // further tier to try; page context was already the only signal.
      const plotPhrase = command.params?.plotId ? ` for ${plotLabelFromId(command.params.plotId)}` : "";
      return recordAndReturn(command, { success: false, message: `Do you want a drone mission or a robot mission${plotPhrase}?` });
    }

    // The Farmer
    // Digital Twin workflow: "handle this issue"
    // resolves against whatever finding is CURRENTLY SELECTED in the Digital
    // Twin (`useLiveContextStore`'s own `digitalTwin.selectedEntity` —
    // the SAME real-time selection AuraContext itself reads, set by
    // `digital-twin-page.tsx`'s existing `setSelected`; no second selection
    // mechanism). Every step below is real, deterministic code — never an
    // AI guess about capability or vehicle choice — and every
    // failure path is an honest explanation, never a fabricated mission
    // .
    // AURA Natural-Language-Actions phase, Parts 2–9 — a Farmer describing an
    // inspection request in ordinary language ("Check field A", "There are
    // bugs eating my crops in field B"), NOT tied to an already-selected
    // Digital Twin finding (that's `handle-selected-finding` below). See
    // `handleFieldInspectionRequest`'s own doc comment for the full
    // capability/availability decision tree.
    case "request-field-inspection": {
      // AURA Intelligence phase — `requestedPlotLabel` is set only by the
      // LLM intent-classifier fallback (`lib/aura/intent/`), never by the
      // deterministic parser (which already resolves straight to a real
      // `requestedPlotId` from an explicit "field/plot <letter>" match).
      // The label is UNTRUSTED model output — resolved here against real
      // Plot Store data, exactly like any other client-supplied input;
      // never assumed valid.
      let requestedPlotId = command.params?.requestedPlotId;
      const requestedPlotLabel = command.params?.requestedPlotLabel;
      if (!requestedPlotId && requestedPlotLabel) {
        requestedPlotId = resolvePlotLabelToId(requestedPlotLabel);
        if (!requestedPlotId) {
          const plots = Object.values(usePlotStore.getState().plots);
          const knownLabels = plots.length > 0 ? plots.map((plot) => plot.label).join(", ") : "none configured yet";
          return recordAndReturn(command, {
            success: false,
            message: `I don't see a field matching "${requestedPlotLabel}" on this farm. The real fields here are: ${knownLabels}.`,
          });
        }
      }
      return recordAndReturn(
        command,
        await handleFieldInspectionRequest(
          requestedPlotId,
          command.params?.reportedProblemKeyword,
          command.params?.requestedVehicleKind,
          // The LLM intent-classifier fallback (`lib/aura/intent/`)
          // doesn't classify intent itself yet, only field/problem/vehicle;
          // defaulting to "inspect" there is exactly its pre-Phase-10
          // behavior, unchanged. The deterministic parser (the primary path
          // for the patrol/investigate/resolve phrasings this change adds)
          // always sets this explicitly.
          command.params?.missionIntent ?? "inspect",
        ),
      );
    }

    case "override-pending-vehicle": {
      // Already permission-checked generically above (line 340) — no
      // separate check needed here, same as every other case in this switch.
      return recordAndReturn(command, await resolveVehicleOverride(command.params?.overrideVehicleKind));
    }

    // AURA Live Mission Control phase, Sections 13/14 — vehicle-
    // agnostic mission control with no name/vehicle word to resolve against
    // at all ("Pause it.", "Stop the robot.", "Resume it.", "Cancel it.").
    // `resolveActiveMissionAcrossStores` is the ONLY resolution step (no
    // `resolveMission`/`resolveRobotMission` name lookup possible here) —
    // see that function's own doc comment for the exact "conversation
    // context, then farm-wide-if-unambiguous, else ask" order.
    case "pause-active-mission": {
      const { match, candidates, invalidRecentMatch } = resolveActiveMissionAcrossStores("pause", command.params?.recentMissionRefs);
      if (match) return recordAndReturn(command, await pauseMissionById(match.vehicleKind, match.mission.id, userRole));
      if (candidates.length > 1) return recordAndReturn(command, { success: false, message: clarifyMissionMessage("pause", candidates) });
      return recordAndReturn(command, { success: false, message: noMissionOrWhyNot("pause", invalidRecentMatch) });
    }

    case "resume-active-mission": {
      const { match, candidates, invalidRecentMatch } = resolveActiveMissionAcrossStores("resume", command.params?.recentMissionRefs);
      if (match) return recordAndReturn(command, await resumeMissionById(match.vehicleKind, match.mission.id, userRole));
      if (candidates.length > 1) return recordAndReturn(command, { success: false, message: clarifyMissionMessage("resume", candidates) });
      return recordAndReturn(command, { success: false, message: noMissionOrWhyNot("resume", invalidRecentMatch) });
    }

    case "cancel-active-mission": {
      const { match, candidates, invalidRecentMatch } = resolveActiveMissionAcrossStores("cancel", command.params?.recentMissionRefs);
      if (match) return recordAndReturn(command, proposeMissionCancel(match));
      if (candidates.length > 1) return recordAndReturn(command, { success: false, message: clarifyMissionMessage("cancel", candidates) });
      return recordAndReturn(command, { success: false, message: noMissionOrWhyNot("cancel", invalidRecentMatch) });
    }

    case "handle-selected-finding": {
      const selectedEntity = useLiveContextStore.getState().digitalTwin.selectedEntity;
      if (!selectedEntity || selectedEntity.type !== "finding") {
        return recordAndReturn(command, {
          success: false,
          message: "Select an issue in the Digital Twin first — tap a finding marker, then ask me to handle it.",
        });
      }

      const finding = useFindingStore.getState().findings[selectedEntity.id];
      if (!finding) {
        return recordAndReturn(command, { success: false, message: "I can't find that issue anymore — it may have already been cleared." });
      }

      if (finding.status === "resolved") {
        return recordAndReturn(command, { success: true, message: `${CROP_ISSUE_TYPE_LABELS[finding.issueType]} on ${finding.plotLabel} is already resolved.` });
      }

      // Part 8 — the ONE place that decides whether ANY autonomous unit may
      // act on this issue at all. An issue absent from `ROBOT_ISSUE_CAPABILITIES`
      // (nutrient deficiency, crop stress, damaged crop area) can never be
      // assigned here, regardless of vehicle availability — never invented,
      // never silently widened to a "close enough" capability.
      if (!isRobotCapableIssue(finding.issueType)) {
        return recordAndReturn(command, {
          success: false,
          message: `This issue requires human inspection. I cannot safely assign an autonomous robot to handle ${CROP_ISSUE_TYPE_LABELS[finding.issueType].toLowerCase()} on ${finding.plotLabel}.`,
        });
      }

      // Part 6 — deterministic issue → mission-type mapping (the most
      // specific robot mission type that can resolve this exact issue type),
      // never an AI choice.
      const missionType = resolveRobotMissionTypeForIssue(finding.issueType);
      if (!missionType) {
        // Unreachable given the isRobotCapableIssue check above (every
        // capable issue type has a matching mission type by construction —
        // see robot-mission-capabilities.ts's own doc comment) — kept as an
        // honest fallback rather than a non-null assertion, never a silent
        // "worked anyway".
        return recordAndReturn(command, { success: false, message: "I couldn't determine which mission type resolves this issue." });
      }

      // Part 7 — real current vehicle state, the SAME "free" definition
      // `autonomous-behavior.ts`'s own dispatch sweep uses (never busy on
      // another mission, never charging/maintenance/offline). Multiple
      // matches resolve deterministically to the first by store order —
      // never random.
      const availableRobot = Object.values(useRobotStore.getState().robots).find(
        (robot) => FREE_ROBOT_STATUSES.includes(robot.status) && robot.activeMissionId === null,
      );
      if (!availableRobot) {
        return recordAndReturn(command, {
          success: false,
          message: `${ROBOT_MISSION_TYPE_LABELS[missionType]} needs a ground robot, but none are available right now — every robot is already on a mission, charging, or offline. Try again once one is free.`,
        });
      }

      // "Safe Action Confirmation," gated by the
      // Farmer's own Settings preference (`actionConfirmationRequired`,
      // default ON). Everything above is still a pure check (capability,
      // mission-type, availability) — nothing is created yet either way.
      if (!useFarmerSettingsStore.getState().actionConfirmationRequired) {
        return recordAndReturn(command, await executeRobotFindingMission(finding, missionType, availableRobot));
      }

      usePendingActionStore.getState().propose({ kind: "handle-selected-finding", findingId: finding.id, missionType, robotId: availableRobot.id });

      return recordAndReturn(command, {
        success: true,
        message: `I found ${CROP_ISSUE_TYPE_LABELS[finding.issueType].toLowerCase()} on ${finding.plotLabel}. ${availableRobot.name} is available and can handle this (${ROBOT_MISSION_TYPE_LABELS[missionType]}). Would you like me to assign the mission?`,
      });
    }

    case "confirm-pending-action": {
      // Duplicate-protection — `consume()` clears the pending
      // action SYNCHRONOUSLY, before any `await` below runs. A second "yes"
      // arriving while this one is still mid-flight (e.g. a rapid
      // double-submit that slipped past `isStreaming`'s own re-entrancy
      // guard in `aura-chat-store.ts`) finds nothing pending and reports
      // that honestly, rather than dispatching a second mission.
      const pending = usePendingActionStore.getState().consume();
      if (!pending) {
        return recordAndReturn(command, { success: false, message: "There's nothing pending for me to confirm right now." });
      }

      if (pending.kind === "handle-selected-finding") {
        // Part 36 — re-verify from scratch rather than trusting the
        // proposal: real time has passed since the propose turn (at minimum
        // the Farmer's own reply time), during which the finding could have
        // been resolved by something else, or the robot could have been
        // claimed by another mission. Never execute a plan against stale
        // state.
        const finding = useFindingStore.getState().findings[pending.findingId];
        if (!finding) {
          return recordAndReturn(command, { success: false, message: "I can't find that issue anymore — it may have already been cleared." });
        }
        if (finding.status === "resolved") {
          return recordAndReturn(command, { success: true, message: `${CROP_ISSUE_TYPE_LABELS[finding.issueType]} on ${finding.plotLabel} is already resolved — no action needed.` });
        }

        const robot = useRobotStore.getState().robots[pending.robotId];
        const stillAvailable = robot && FREE_ROBOT_STATUSES.includes(robot.status) && robot.activeMissionId === null;
        if (!robot || !stillAvailable) {
          return recordAndReturn(command, {
            success: false,
            message: `${robot?.name ?? "That robot"} is no longer available — it may have been assigned elsewhere in the meantime. Ask me again and I'll check for another one.`,
          });
        }

        return recordAndReturn(command, await executeRobotFindingMission(finding, pending.missionType, robot));
      }

      if (pending.kind === "mission-control-cancel") {
        // Re-verified from scratch by `cancelMissionById`
        // itself (still exists? still not already completed/cancelled by
        // something else in the meantime?), same "never trust the proposal"
        // principle every other pending-action kind here already follows.
        return recordAndReturn(command, await cancelMissionById(pending.vehicleKind, pending.missionId, userRole));
      }

      if (pending.kind === "mission-control-clarify") {
        // Unreachable in practice — `resolveMissionClarification` in
        // `aura-chat-store.ts` always tries this kind FIRST, before a
        // message ever reaches `parseCommand`/`confirm-pending-action`, and
        // a bare "yes"/"no" (the only way to land on this commandId) was
        // never one of the offered candidates in the first place. Kept as an
        // honest fallback rather than a non-null assertion, matching this
        // file's own convention elsewhere.
        return recordAndReturn(command, { success: false, message: "I'm not sure which mission you mean — please name the field or vehicle." });
      }

      // pending.kind === "field-inspection" — same re-verification principle:
      // the plot itself can't disappear, but the chosen vehicle's
      // availability must be checked fresh, not assumed from propose time.
      const plot = usePlotStore.getState().plots[pending.plotId];
      if (!plot) {
        return recordAndReturn(command, { success: false, message: `I can't find ${pending.plotLabel} anymore.` });
      }

      if (pending.vehicleKind === "robot") {
        const robot = useRobotStore.getState().robots[pending.robotId!];
        const stillAvailable = robot && FREE_ROBOT_STATUSES.includes(robot.status) && robot.activeMissionId === null;
        if (!robot || !stillAvailable) {
          return recordAndReturn(command, {
            success: false,
            message: `${robot?.name ?? "That robot"} is no longer available — it may have been assigned elsewhere in the meantime. Ask me again and I'll check for another one.`,
          });
        }
        return recordAndReturn(command, await executeRobotFieldInspectionMission(plot, pending.robotMissionType!, robot));
      }

      const drone = useFleetStore.getState().drones[pending.droneId!];
      const stillAvailable = drone && FREE_DRONE_STATUSES.includes(drone.status) && drone.activeMissionId === null;
      if (!drone || !stillAvailable) {
        return recordAndReturn(command, {
          success: false,
          message: `${drone?.name ?? "That drone"} is no longer available — it may have been assigned elsewhere in the meantime. Ask me again and I'll check for another one.`,
        });
      }
      return recordAndReturn(command, await executeDroneFieldInspectionMission(plot, pending.droneMissionType!, drone));
    }

    case "cancel-pending-action": {
      const hadPending = usePendingActionStore.getState().consume() !== null;
      return recordAndReturn(command, {
        success: true,
        message: hadPending ? "Okay, I won't take any action." : "There's nothing pending to cancel.",
      });
    }

    default:
      return { success: false, message: "I can't execute that action yet." };
  }
}

/**
 * Fixes a genuine root
 * cause live testing found, deeper than a simple "create raced
 * assign" ordering issue: `createMission`/`assignRobot`/`generateRoute`/
 * `startMission` each fire their OWN independent, unawaited PATCH to the
 * SAME row in rapid succession (no request waits for the previous one to
 * land) — `assignRobot`'s own patch explicitly resets `waypoints: []`
 * (clearing any stale route from a previous assignment), so if THAT
 * request's response happens to arrive at the server AFTER
 * `generateRoute`'s real-waypoints patch (ordinary network/server
 * scheduling nondeterminism, not a bug in either call), the real route gets
 * silently wiped back to empty — confirmed live: several test missions
 * persisted with a correct `status`/`assignedRobotId` but `waypoints: []`.
 *
 * The fix: after the full local sequence completes (client-side state is
 * always correct immediately — this is purely a durability concern), send
 * ONE additional, fully-AWAITED corrective PATCH containing the complete,
 * final mission snapshot. Being awaited and sent last, it reliably wins
 * over any still-in-flight earlier writes for every field that matters.
 * A short settle delay first gives those earlier requests a realistic
 * chance to finish so this one is genuinely last on the wire, not just last
 * to be sent. A final read-back confirms the corrective write really
 * stuck — if it didn't (the server unreachable, a real error), that's
 * reported to the Farmer honestly, never assumed away.
 */
const MISSION_SYNC_SETTLE_MS = 600;

async function syncRobotMissionToServer(missionId: string): Promise<boolean> {
  const mission = useRobotMissionStore.getState().missions[missionId];
  if (!mission) return false;
  await new Promise((resolve) => setTimeout(resolve, MISSION_SYNC_SETTLE_MS));
  try {
    // This corrective PATCH is now enqueued through
    // the SAME per-mission-id `runSerialized` queue `robot-mission-store.ts`'s
    // own `persistPatch`/`persistCreate` use, not a bare `fetch`. Before this
    // fix, this verification PATCH could itself race ahead of (or behind) an
    // still-in-flight fire-and-forget write from `assignRobot`/`generateRoute`/
    // `startMission` for the exact same mission — the confirmed root cause of
    // an occasional `status: "queued", assignedRobotId: null` persisted row
    // even though the mission was genuinely running. Queuing this call after
    // every write already issued for this mission id guarantees it is the
    // LAST write applied, so the verification GET below always reads back
    // what this dispatch actually intended to save.
    const patchResponse = await runSerialized(missionId, () =>
      fetch(`/api/robot-missions/${missionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedRobotId: mission.assignedRobotId,
          status: mission.status,
          waypoints: mission.waypoints,
          estimate: mission.estimate,
          homePosition: mission.homePosition,
          startPosition: mission.startPosition,
          returnPosition: mission.returnPosition,
          progressPercent: mission.progressPercent,
          coverageProgressPercent: mission.coverageProgressPercent,
          currentWaypointIndex: mission.currentWaypointIndex,
          batteryAtStartPercent: mission.batteryAtStartPercent,
          startedAt: mission.startedAt,
        }),
      }),
    );
    if (!patchResponse.ok) return false;

    const verifyResponse = await fetch(`/api/robot-missions/${missionId}`);
    if (!verifyResponse.ok) return false;
    const data = (await verifyResponse.json()) as { mission?: { assignedRobotId: string | null; waypoints: unknown; status: string } };
    const saved = data.mission;
    return !!saved && saved.assignedRobotId === mission.assignedRobotId && Array.isArray(saved.waypoints) && saved.waypoints.length === mission.waypoints.length && saved.status !== "queued";
  } catch {
    return false;
  }
}

async function syncDroneMissionToServer(missionId: string): Promise<boolean> {
  const mission = useMissionStore.getState().missions[missionId];
  if (!mission) return false;
  await new Promise((resolve) => setTimeout(resolve, MISSION_SYNC_SETTLE_MS));
  try {
    // Same reasoning as `syncRobotMissionToServer`
    // above: enqueued through the SAME per-mission-id `runSerialized` queue
    // `mission-store.ts`'s own `persistPatch`/`persistCreate` use, so this
    // verification PATCH always lands strictly after every write already
    // issued by `assignDrone`/`generatePath`/`startMission` for this exact
    // mission id, never racing them.
    const patchResponse = await runSerialized(missionId, () =>
      fetch(`/api/missions/${missionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedDroneId: mission.assignedDroneId,
          status: mission.status,
          waypoints: mission.waypoints,
          estimate: mission.estimate,
          homePosition: mission.homePosition,
          takeoffPosition: mission.takeoffPosition,
          landingPosition: mission.landingPosition,
          progressPercent: mission.progressPercent,
          coverageProgressPercent: mission.coverageProgressPercent,
          currentWaypointIndex: mission.currentWaypointIndex,
          batteryAtStartPercent: mission.batteryAtStartPercent,
          startedAt: mission.startedAt,
        }),
      }),
    );
    if (!patchResponse.ok) return false;

    const verifyResponse = await fetch(`/api/missions/${missionId}`);
    if (!verifyResponse.ok) return false;
    const data = (await verifyResponse.json()) as { mission?: { assignedDroneId: string | null; waypoints: unknown; status: string } };
    const saved = data.mission;
    return !!saved && saved.assignedDroneId === mission.assignedDroneId && Array.isArray(saved.waypoints) && saved.waypoints.length === mission.waypoints.length && saved.status !== "queued";
  } catch {
    return false;
  }
}

// =============================================================================
// AURA Live Mission Control — natural-language pause/resume/cancel,
// cross-store reference resolution, and the by-id functions the Mission
// Card's own buttons call. Every control below reuses the EXACT SAME
// `pauseMission`/`resumeMission`/`cancelMission` store actions the Mission
// Planner UI's own buttons already call (see `robot-mission-inspector.tsx`'s
// `canPause`/`canResume`/`canCancel`, mirrored exactly here) — this is a new
// RESOLUTION and VERIFICATION layer on top of the existing mission state
// machine, never a second one (Security rule 35).
// =============================================================================

/** Mirrors `MISSION_SYNC_SETTLE_MS`'s reasoning exactly — a short settle window before reading back what a pause/resume/cancel PATCH actually saved. */
async function verifyRobotMissionStatus(missionId: string, isExpected: (status: RobotMissionStatus) => boolean): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, MISSION_SYNC_SETTLE_MS));
  try {
    // Enqueued through the SAME per-mission-id queue `persistPatch`/the
    // dispatch-time corrective PATCH already use — this
    // GET only ever runs after every write already issued for this mission
    // id, so it can never read a state older than the pause/resume/cancel
    // call that triggered it.
    const response = await runSerialized(missionId, () => fetch(`/api/robot-missions/${missionId}`));
    if (!response.ok) return false;
    const data = (await response.json()) as { mission?: { status: string } };
    return !!data.mission && isExpected(data.mission.status as RobotMissionStatus);
  } catch {
    return false;
  }
}

async function verifyDroneMissionStatus(missionId: string, isExpected: (status: MissionStatus) => boolean): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, MISSION_SYNC_SETTLE_MS));
  try {
    const response = await runSerialized(missionId, () => fetch(`/api/missions/${missionId}`));
    if (!response.ok) return false;
    const data = (await response.json()) as { mission?: { status: string } };
    return !!data.mission && isExpected(data.mission.status as MissionStatus);
  } catch {
    return false;
  }
}

type ActiveMissionMatch = { vehicleKind: "robot"; mission: RobotMissionRecord } | { vehicleKind: "drone"; mission: MissionRecord };

type MissionControlAction = "pause" | "resume" | "cancel";

/** Mirrors `robot-mission-inspector.tsx`'s own `canPause`/`canResume`/`canCancel` exactly — the SAME real-world precondition a human clicking the Mission Planner's own buttons is already held to, applied here so AURA can never attempt (or offer) a transition the existing UI itself would grey out. */
function isRobotMissionValidFor(action: MissionControlAction, status: RobotMissionStatus): boolean {
  if (action === "pause") return ROBOT_MISSION_ACTIVE_STATUSES.includes(status);
  if (action === "resume") return status === "paused";
  return status !== "completed" && status !== "cancelled";
}

/** Mirrors the drone Mission Planner's identical precondition set, for `MISSION_FLIGHT_STATUSES` instead of the robot equivalent. */
function isDroneMissionValidFor(action: MissionControlAction, status: MissionStatus): boolean {
  if (action === "pause") return MISSION_FLIGHT_STATUSES.includes(status);
  if (action === "resume") return status === "paused";
  return status !== "completed" && status !== "cancelled";
}

/** The real mission a ref points at, regardless of whether it's currently valid for any particular action — used only to produce an honest, SPECIFIC "already paused"/"already completed" message (see `resolveActiveMissionAcrossStores`'s own `invalidRecentMatch`) rather than a generic "I don't see one" when resolution otherwise comes up empty. */
function missionFromRef(ref: AuraMissionRef): ActiveMissionMatch | null {
  if (ref.vehicleKind === "robot") {
    const mission = useRobotMissionStore.getState().missions[ref.missionId];
    return mission ? { vehicleKind: "robot", mission } : null;
  }
  const mission = useMissionStore.getState().missions[ref.missionId];
  return mission ? { vehicleKind: "drone", mission } : null;
}

function matchFromRef(action: MissionControlAction, ref: AuraMissionRef): ActiveMissionMatch | null {
  const found = missionFromRef(ref);
  if (!found) return null;
  const valid = found.vehicleKind === "robot" ? isRobotMissionValidFor(action, found.mission.status) : isDroneMissionValidFor(action, found.mission.status);
  return valid ? found : null;
}

function allMissionsValidFor(action: MissionControlAction): ActiveMissionMatch[] {
  const robotMatches: ActiveMissionMatch[] = Object.values(useRobotMissionStore.getState().missions)
    .filter((mission) => isRobotMissionValidFor(action, mission.status))
    .map((mission) => ({ vehicleKind: "robot" as const, mission }));
  const droneMatches: ActiveMissionMatch[] = Object.values(useMissionStore.getState().missions)
    .filter((mission) => isDroneMissionValidFor(action, mission.status))
    .map((mission) => ({ vehicleKind: "drone" as const, mission }));
  return [...robotMatches, ...droneMatches];
}

/**
 * AURA Live Mission Control phase, Sections 13–15/36 — resolves a
 * vehicle-agnostic/pronoun mission-control request ("Pause it.", "Cancel
 * that mission.", "Stop the robot.") WITHOUT ever guessing among several
 * real candidates (Security rule 19). Only used as a FALLBACK once an
 * explicit mission name (checked by each case's own `resolveMission`/
 * `resolveRobotMission` call first, unchanged from before this change) finds
 * nothing.
 *
 * Resolution order:
 *  1. This conversation's own recently-dispatched missions (`recentRefs` —
 *  see `AuraMessage`/`aura-chat-store.ts`'s `missionRefsByMessageId`),
 *  filtered to whichever are actually still valid for THIS action right
 *  now (re-checked against live store state, never assumed from when
 *  they were dispatched). Exactly one → that's the answer. More than
 *  one → ambiguous, ask (never silently pick "most recent").
 *  2. Only if the conversation itself named none: every mission farm-wide
 *  (either vehicle kind) currently valid for this action. Exactly one →
 *  unambiguous regardless of whether THIS conversation ever mentioned it
 *  (mirrors `handleFieldInspectionRequest`'s own "only one plot on the
 *  farm" auto-resolve precedent). Zero or more than one → no guess.
 */
function resolveActiveMissionAcrossStores(
  action: MissionControlAction,
  recentRefs: AuraMissionRef[] | undefined,
): { match: ActiveMissionMatch | null; candidates: ActiveMissionMatch[]; invalidRecentMatch: ActiveMissionMatch | null } {
  const seen = new Set<string>();
  const fromConversation: ActiveMissionMatch[] = [];
  // Tracked separately from `fromConversation` purely
  // for a BETTER WORDED refusal ("already paused" instead of a generic "I
  // don't see one") when this conversation named exactly one real mission
  // but it's no longer valid for this specific action (e.g. a duplicate
  // "Pause it." while already paused) — never used to widen who counts as
  // a genuine match.
  const invalidRecent: ActiveMissionMatch[] = [];
  for (const ref of recentRefs ?? []) {
    if (seen.has(ref.missionId)) continue;
    seen.add(ref.missionId);
    const match = matchFromRef(action, ref);
    if (match) {
      fromConversation.push(match);
    } else {
      const found = missionFromRef(ref);
      if (found) invalidRecent.push(found);
    }
  }
  if (fromConversation.length === 1) return { match: fromConversation[0]!, candidates: [], invalidRecentMatch: null };
  if (fromConversation.length > 1) return { match: null, candidates: fromConversation, invalidRecentMatch: null };

  const farmWide = allMissionsValidFor(action);
  if (farmWide.length === 1) return { match: farmWide[0]!, candidates: [], invalidRecentMatch: null };
  return { match: null, candidates: farmWide, invalidRecentMatch: invalidRecent.length === 1 ? invalidRecent[0]! : null };
}

function plotLabelForMission(match: ActiveMissionMatch): string | null {
  if (!match.mission.targetPlotId) return null;
  return usePlotStore.getState().plots[match.mission.targetPlotId]?.label ?? null;
}

function vehicleNameForMission(match: ActiveMissionMatch): string | null {
  if (match.vehicleKind === "robot") {
    const id = match.mission.assignedRobotId;
    return id ? (useRobotStore.getState().robots[id]?.name ?? null) : null;
  }
  const id = match.mission.assignedDroneId;
  return id ? (useFleetStore.getState().drones[id]?.name ?? null) : null;
}

/**
 * Asking "which mission?" is only half of "never
 * guess": the farmer's short answer ("Field B.", "The drone.", "Hag.") must
 * actually complete the action, or the safety behavior just looks like a
 * dead end. Proposes a `mission-control-clarify` pending action (consumed by
 * `resolveMissionClarification` below) alongside the honest question, same
 * "propose now, verify from scratch when consumed" pattern every other
 * pending-action kind here already follows.
 */
function clarifyMissionMessage(action: MissionControlAction, candidates: ActiveMissionMatch[]): string {
  usePendingActionStore.getState().propose({
    kind: "mission-control-clarify",
    action,
    candidates: candidates.map((candidate) => ({
      vehicleKind: candidate.vehicleKind,
      missionId: candidate.mission.id,
      missionName: candidate.mission.name,
      plotLabel: plotLabelForMission(candidate),
      vehicleName: vehicleNameForMission(candidate),
    })),
  });
  const verb = action === "pause" ? "pause" : action === "resume" ? "resume" : "cancel";
  const options = candidates
    .map((candidate) => {
      const plot = plotLabelForMission(candidate);
      const vehicle = vehicleNameForMission(candidate);
      return plot && vehicle ? `${vehicle} in ${plot}` : `"${candidate.mission.name}"`;
    })
    .join(" or ");
  return `Which mission would you like me to ${verb} — ${options}?`;
}

/**
 * Consumes a pending `mission-control-clarify` action if `text` unambiguously
 * names exactly one of its candidates (by plot label or assigned vehicle
 * name) — returns `null` (and leaves the pending action untouched for the
 * caller to clear as a stale/irrelevant reply) when it doesn't match
 * anything or matches more than one candidate. Never guesses: a reply that
 * still doesn't disambiguate is treated as a fresh, unrelated message, not a
 * second guess at the same question.
 */
export async function resolveMissionClarification(text: string, userRole: string | null): Promise<ActionResult | null> {
  const pending = usePendingActionStore.getState().pending;
  if (!pending || pending.kind !== "mission-control-clarify") return null;

  const normalized = text.trim().toLowerCase();
  // "Field D." must match a candidate whose plot label is "Plot D" — farmers
  // say "field", the app's own plot labels say "Plot" (see `FIELD_OR_PLOT_LETTER`
  // in command-parser.ts, the same synonym command-parser.ts's own deterministic
  // patterns already normalize); comparing by LETTER rather than the literal
  // "plot"/"field" word is what actually makes that synonym work here too.
  const requestedLetter = normalized.match(/\b(?:field|plot)\s*([a-d])\b/i)?.[1]?.toLowerCase();
  const matches = pending.candidates.filter((candidate) => {
    const candidateLetter = candidate.plotLabel?.match(/([a-d])\s*$/i)?.[1]?.toLowerCase();
    const plotMatch = !!requestedLetter && !!candidateLetter && requestedLetter === candidateLetter;
    const vehicleMatch = candidate.vehicleName ? normalized.includes(candidate.vehicleName.toLowerCase()) : false;
    return plotMatch || vehicleMatch;
  });
  if (matches.length !== 1) return null;

  usePendingActionStore.getState().consume();
  const chosen = matches[0]!;
  if (pending.action === "pause") return pauseMissionById(chosen.vehicleKind, chosen.missionId, userRole);
  if (pending.action === "resume") return resumeMissionById(chosen.vehicleKind, chosen.missionId, userRole);

  // "cancel" still requires its own explicit confirmation — resolving WHICH
  // mission is not the same as confirming the destructive action itself
  // (the two-step requirement stays intact either way).
  if (chosen.vehicleKind === "robot") {
    const mission = useRobotMissionStore.getState().missions[chosen.missionId];
    if (!mission) return { success: false, message: "I can't find that mission anymore — it may already be gone." };
    if (mission.status === "completed" || mission.status === "cancelled") {
      return { success: false, message: `"${mission.name}" is already ${mission.status}.` };
    }
    return proposeMissionCancel({ vehicleKind: "robot", mission });
  }
  const mission = useMissionStore.getState().missions[chosen.missionId];
  if (!mission) return { success: false, message: "I can't find that mission anymore — it may already be gone." };
  if (mission.status === "completed" || mission.status === "cancelled") {
    return { success: false, message: `"${mission.name}" is already ${mission.status}.` };
  }
  return proposeMissionCancel({ vehicleKind: "drone", mission });
}

/** A specific, honest refusal for the one common case a generic "I don't see an active mission" would otherwise flatten: this conversation clearly meant ONE real mission, it's just not in a state this action applies to anymore. Falls back to the generic message otherwise. */
function noMissionOrWhyNot(action: MissionControlAction, invalidRecentMatch: ActiveMissionMatch | null): string {
  if (!invalidRecentMatch) return noMissionMessage(action);
  const { mission } = invalidRecentMatch;
  if (action === "pause") {
    return mission.status === "paused" ? `"${mission.name}" is already paused.` : `"${mission.name}" isn't currently in progress.`;
  }
  if (action === "resume") {
    return mission.status !== "paused" ? `"${mission.name}" isn't paused.` : noMissionMessage(action);
  }
  return `"${mission.name}" is already ${mission.status}.`;
}

function noMissionMessage(action: MissionControlAction): string {
  const verb = action === "pause" ? "pause" : action === "resume" ? "resume" : "cancel";
  return `I don't see an active mission to ${verb} right now.`;
}

/**
 * Actually pauses a real mission and verifies the backend agreed — used by
 * BOTH the deterministic pause commands below AND the AURA Mission Card's
 * own Pause button (`AuraMissionCard`), so there is exactly one execution
 * path regardless of how the farmer triggered it (Security rule 33). Never
 * claims success before `verifyRobotMissionStatus`/`verifyDroneMissionStatus`
 * agrees (Security rule 20).
 */
export async function pauseMissionById(vehicleKind: "robot" | "drone", missionId: string, userRole: string | null): Promise<ActionResult> {
  const permission = canExecuteAction("pause-active-mission", userRole);
  if (!permission.allowed) return { success: false, message: permission.reason ?? "You don't have permission to do that." };

  if (vehicleKind === "robot") {
    const mission = useRobotMissionStore.getState().missions[missionId];
    if (!mission) return { success: false, message: "I can't find that mission anymore — it may already be gone." };
    if (!isRobotMissionValidFor("pause", mission.status)) {
      return {
        success: false,
        message: mission.status === "paused" ? `"${mission.name}" is already paused.` : `"${mission.name}" isn't currently in progress.`,
      };
    }
    useRobotMissionStore.getState().pauseMission(missionId);
    const verified = await verifyRobotMissionStatus(missionId, (status) => status === "paused");
    return verified
      ? { success: true, message: `Paused "${mission.name}".` }
      : { success: false, message: `I couldn't confirm the pause was saved for "${mission.name}" — it may still be running. Try again in a moment.` };
  }

  const mission = useMissionStore.getState().missions[missionId];
  if (!mission) return { success: false, message: "I can't find that mission anymore — it may already be gone." };
  if (!isDroneMissionValidFor("pause", mission.status)) {
    return {
      success: false,
      message: mission.status === "paused" ? `"${mission.name}" is already paused.` : `"${mission.name}" isn't currently in flight.`,
    };
  }
  useMissionStore.getState().pauseMission(missionId);
  const verified = await verifyDroneMissionStatus(missionId, (status) => status === "paused");
  return verified
    ? { success: true, message: `Paused "${mission.name}".` }
    : { success: false, message: `I couldn't confirm the pause was saved for "${mission.name}" — it may still be running. Try again in a moment.` };
}

/** Mirrors `pauseMissionById` exactly — see that function's own doc comment. */
export async function resumeMissionById(vehicleKind: "robot" | "drone", missionId: string, userRole: string | null): Promise<ActionResult> {
  const permission = canExecuteAction("resume-active-mission", userRole);
  if (!permission.allowed) return { success: false, message: permission.reason ?? "You don't have permission to do that." };

  if (vehicleKind === "robot") {
    const mission = useRobotMissionStore.getState().missions[missionId];
    if (!mission) return { success: false, message: "I can't find that mission anymore — it may already be gone." };
    if (mission.status !== "paused") return { success: false, message: `"${mission.name}" isn't paused.` };
    useRobotMissionStore.getState().resumeMission(missionId);
    const verified = await verifyRobotMissionStatus(missionId, (status) => status !== "paused");
    return verified
      ? { success: true, message: `Resumed "${mission.name}".` }
      : { success: false, message: `I couldn't resume "${mission.name}" — it is still paused.` };
  }

  const mission = useMissionStore.getState().missions[missionId];
  if (!mission) return { success: false, message: "I can't find that mission anymore — it may already be gone." };
  if (mission.status !== "paused") return { success: false, message: `"${mission.name}" isn't paused.` };
  useMissionStore.getState().resumeMission(missionId);
  const verified = await verifyDroneMissionStatus(missionId, (status) => status !== "paused");
  return verified
    ? { success: true, message: `Resumed "${mission.name}".` }
    : { success: false, message: `I couldn't resume "${mission.name}" — it is still paused.` };
}

/**
 * Actually cancels a real mission (assumes the farmer already confirmed —
 * see `proposeMissionCancel`/`PendingMissionCancelAction` — or that the
 * Mission Card's own inline confirm step already ran) and verifies the
 * backend agreed. Re-checks the mission is still cancellable from scratch
 * (cancelling never deletes history — the record simply moves to
 * `status: "cancelled"`, same as every other real status transition).
 */
export async function cancelMissionById(vehicleKind: "robot" | "drone", missionId: string, userRole: string | null): Promise<ActionResult> {
  const permission = canExecuteAction("cancel-active-mission", userRole);
  if (!permission.allowed) return { success: false, message: permission.reason ?? "You don't have permission to do that." };

  if (vehicleKind === "robot") {
    const mission = useRobotMissionStore.getState().missions[missionId];
    if (!mission) return { success: false, message: "I can't find that mission anymore — it may already be gone." };
    if (mission.status === "completed" || mission.status === "cancelled") {
      return { success: false, message: `"${mission.name}" is already ${mission.status}.` };
    }
    useRobotMissionStore.getState().cancelMission(missionId);
    const verified = await verifyRobotMissionStatus(missionId, (status) => status === "cancelled");
    return verified
      ? { success: true, message: `"${mission.name}" has been cancelled. Its record remains in your mission history.` }
      : {
          success: false,
          message: `I cancelled "${mission.name}" in this session, but couldn't confirm the system saved it. Check Ground Robots to confirm it's really stopped.`,
        };
  }

  const mission = useMissionStore.getState().missions[missionId];
  if (!mission) return { success: false, message: "I can't find that mission anymore — it may already be gone." };
  if (mission.status === "completed" || mission.status === "cancelled") {
    return { success: false, message: `"${mission.name}" is already ${mission.status}.` };
  }
  useMissionStore.getState().cancelMission(missionId);
  const verified = await verifyDroneMissionStatus(missionId, (status) => status === "cancelled");
  return verified
    ? { success: true, message: `"${mission.name}" has been cancelled. Its record remains in your mission history.` }
    : {
        success: false,
        message: `I cancelled "${mission.name}" in this session, but couldn't confirm the system saved it. Check Drone Fleet to confirm it's really stopped.`,
      };
}

/** Proposes (never immediately performs) a cancellation — "cancellation should require appropriate confirmation." */
function proposeMissionCancel(match: ActiveMissionMatch): ActionResult {
  usePendingActionStore.getState().propose({
    kind: "mission-control-cancel",
    vehicleKind: match.vehicleKind,
    missionId: match.mission.id,
    missionName: match.mission.name,
  });
  return { success: true, message: `Cancel "${match.mission.name}"? The mission will stop and this action cannot be undone.` };
}

interface MissionDispatchOutcome {
  success: boolean;
  missionName: string;
  failureMessage?: string;
  /** The real, already-created mission's id, set on EVERY outcome once `createMission` has run (even a failed/unconfirmed one still exists locally and usually in the database — see the honest wording each failure branch already uses). Lets the caller tag a successful `ActionResult` with a live `missionRef` for the AURA Mission Card; a failed dispatch never gets tagged (see each wrapper below), so no card is ever shown for a mission that was never confirmed. */
  missionId?: string;
}

/**
 * The actual create/assign/route/start(+verify) sequence for a robot
 * mission — the ONE place every robot-dispatching AURA action calls (the
 * existing finding-resolution flow AND the new field-inspection flow below),
 * so the persistence-verification logic and duplicate/failure
 * handling exist exactly once. Never records to
 * `useActionHistoryStore` itself — the caller does, via `recordAndReturn`.
 */
async function dispatchRobotMission(missionName: string, missionType: RobotMissionType, plotId: string, robot: RobotRecord): Promise<MissionDispatchOutcome> {
  const mission = useRobotMissionStore.getState().createMission({ name: missionName, missionType, targetPlotId: plotId });
  useRobotMissionStore.getState().assignRobot(mission.id, robot.id);

  if (!useRobotMissionStore.getState().generateRoute(mission.id)) {
    return { success: false, missionName, missionId: mission.id, failureMessage: `I created "${missionName}" and assigned ${robot.name}, but couldn't generate a ground route for it — try again.` };
  }
  if (!useRobotMissionStore.getState().startMission(mission.id)) {
    return { success: false, missionName, missionId: mission.id, failureMessage: `I created "${missionName}" and assigned ${robot.name}, but the mission couldn't be started — try again.` };
  }

  const synced = await syncRobotMissionToServer(mission.id);
  if (!synced) {
    // Part 12 — honest, conservative reporting: the mission IS genuinely
    // running in this session (the local store mutation above always
    // succeeds), but AURA never claims full, confirmed success without the
    // backend agreeing — never cancelled automatically either:
    // doing so would discard a mission that, in practice,
    // usually DOES persist given a little more real time — just not
    // durably confirmed yet.
    return {
      success: false,
      missionName,
      missionId: mission.id,
      failureMessage: `I started "${missionName}" with ${robot.name} in this session, but I couldn't confirm the system saved it — it may not survive a page refresh. Check Ground Robots to confirm it's really running.`,
    };
  }

  return { success: true, missionName, missionId: mission.id };
}

async function dispatchDroneMission(missionName: string, missionType: MissionType, plotId: string, drone: DroneRecord): Promise<MissionDispatchOutcome> {
  const mission = useMissionStore.getState().createMission({ name: missionName, missionType, targetPlotId: plotId });
  useMissionStore.getState().assignDrone(mission.id, drone.id);

  if (!useMissionStore.getState().generatePath(mission.id)) {
    return { success: false, missionName, missionId: mission.id, failureMessage: `I created "${missionName}" and assigned ${drone.name}, but couldn't generate a flight path for it — try again.` };
  }
  if (!useMissionStore.getState().startMission(mission.id)) {
    return { success: false, missionName, missionId: mission.id, failureMessage: `I created "${missionName}" and assigned ${drone.name}, but the mission couldn't be started — try again.` };
  }

  const synced = await syncDroneMissionToServer(mission.id);
  if (!synced) {
    return {
      success: false,
      missionName,
      missionId: mission.id,
      failureMessage: `I started "${missionName}" with ${drone.name} in this session, but I couldn't confirm the system saved it — it may not survive a page refresh. Check Drone Fleet to confirm it's really running.`,
    };
  }

  return { success: true, missionName, missionId: mission.id };
}

/**
 * Wraps `dispatchRobotMission` with the
 * finding-resolution flow's own wording ("handle the pest activity").
 */
async function executeRobotFindingMission(finding: CropFinding, missionType: RobotMissionType, robot: RobotRecord): Promise<ActionResult> {
  const missionName = `${finding.plotLabel} ${ROBOT_MISSION_TYPE_LABELS[missionType]}`;
  const outcome = await dispatchRobotMission(missionName, missionType, finding.plotId, robot);
  if (!outcome.success) return { success: false, message: outcome.failureMessage! };
  return {
    success: true,
    message: `I'm sending ${robot.name} to ${finding.plotLabel} to handle the ${CROP_ISSUE_TYPE_LABELS[finding.issueType].toLowerCase()} — mission "${missionName}" is now underway.`,
    // A genuinely confirmed dispatch (see `MissionDispatchOutcome`'s
    // own doc comment: `outcome.success` is only true once the backend
    // verification GET agreed) gets a live mission card; a degraded
    // "couldn't confirm the save" outcome above never does, so the card
    // never shows for a mission AURA itself isn't confident really exists.
    missionRef: { vehicleKind: "robot", missionId: outcome.missionId! },
  };
}

/** AURA Natural-Language-Actions phase — wraps `dispatchRobotMission` with the plain-language field-inspection flow's own wording ("Check field A"). */
async function executeRobotFieldInspectionMission(plot: { id: string; label: string }, missionType: RobotMissionType, robot: RobotRecord): Promise<ActionResult> {
  const missionName = `${plot.label} ${ROBOT_MISSION_TYPE_LABELS[missionType]}`;
  const outcome = await dispatchRobotMission(missionName, missionType, plot.id, robot);
  if (!outcome.success) return { success: false, message: outcome.failureMessage! };
  return {
    success: true,
    message: `Done. ${robot.name} has started inspecting ${plot.label} — mission "${missionName}" is now underway.`,
    missionRef: { vehicleKind: "robot", missionId: outcome.missionId! },
  };
}

/** Same idea, for a drone (detect-only — see `handleFieldInspectionRequest`'s own doc comment for when a drone is chosen over a robot). */
async function executeDroneFieldInspectionMission(plot: { id: string; label: string }, missionType: MissionType, drone: DroneRecord): Promise<ActionResult> {
  const missionName = `${plot.label} ${MISSION_TYPE_LABELS[missionType]}`;
  const outcome = await dispatchDroneMission(missionName, missionType, plot.id, drone);
  if (!outcome.success) return { success: false, message: outcome.failureMessage! };
  return {
    success: true,
    message: `Done. ${drone.name} has started inspecting ${plot.label} — mission "${missionName}" is now underway.`,
    missionRef: { vehicleKind: "drone", missionId: outcome.missionId! },
  };
}

// AURA Natural-Language-Actions phase, Part 6 — deterministic keyword→issue
// mapping for a farmer's free-text problem report ("bugs eating my crops" →
// pest-activity). Deliberately small and explicit, never an AI guess about
// WHICH capability is needed — only the earlier natural-language MATCH (did
// the farmer mention a problem at all) uses fuzzy phrasing; once matched,
// the resulting keyword→issue-type step is a plain lookup table, auditable
// and testable like every other capability decision in this file.
// "disease"/"diseased" is deliberately absent — the real robot-capable
// issue types are specific (pest/weed/fungal/water/dry); guessing a fungal
// mapping for a generic "disease" report would be exactly the kind of
// invented capability Part 6/8 forbids. A generic "check field A" (no
// problem keyword) still gets a full inspection — see below.
const PROBLEM_KEYWORD_TO_ISSUE_TYPE: Record<string, CropIssueType> = {
  pest: "pest-activity",
  pests: "pest-activity",
  insect: "pest-activity",
  insects: "pest-activity",
  bug: "pest-activity",
  bugs: "pest-activity",
  aphid: "pest-activity",
  aphids: "pest-activity",
  weed: "weed-growth",
  weeds: "weed-growth",
  fungal: "fungal-risk",
  fungus: "fungal-risk",
  mold: "fungal-risk",
  mould: "fungal-risk",
  mildew: "fungal-risk",
  flood: "standing-water",
  flooding: "standing-water",
  "standing water": "standing-water",
  waterlog: "standing-water",
  dry: "dry-soil",
  drought: "dry-soil",
  // "irrigation problem"/"watering issue" is one of this change's
  // own worked examples; farmers describing a water-shortage problem don't
  // always say "dry" outright. Same real capability (`simulated-irrigation-
  // cycle`) as the existing dry/drought keywords — not a new issue type.
  irrigation: "dry-soil",
  watering: "dry-soil",
  // These three ARE real `CropIssueType`s
  // (`findings/types.ts`), just ones with no robot-capable corrective
  // action (`ROBOT_ISSUE_CAPABILITIES`). Mapping them here is what lets the
  // "resolve" honest-refusal message above name the ACTUAL problem
  // ("nutrient deficiency", not a generic "that problem") — never a
  // capability grant; `isRobotCapableIssue` still correctly says no for all
  // three. Companion fix to `command-parser.ts`'s widened `PROBLEM_NOUN`.
  nutrient: "nutrient-deficiency",
  nutrients: "nutrient-deficiency",
  deficiency: "nutrient-deficiency",
  "nutrient deficiency": "nutrient-deficiency",
  stressed: "crop-stress",
  "crop stress": "crop-stress",
  "stressed crop": "crop-stress",
  "stressed crops": "crop-stress",
  damage: "damaged-crop-area",
  damaged: "damaged-crop-area",
  damages: "damaged-crop-area",
  "damaged crop": "damaged-crop-area",
  "damaged area": "damaged-crop-area",
};

function mapKeywordToIssueType(keyword: string): CropIssueType | null {
  return PROBLEM_KEYWORD_TO_ISSUE_TYPE[keyword.toLowerCase()] ?? null;
}

/** A drone only ever DETECTS (never resolves — Part 8's rule is unaffected by this change), so this only ever picks the most relevant SURVEY type, never a corrective-action type. `crop-health` is the honest general default when no specific problem was reported or mapped. */
const DRONE_MISSION_TYPE_FOR_ISSUE: Partial<Record<CropIssueType, MissionType>> = {
  "pest-activity": "disease-scan",
  "fungal-risk": "disease-scan",
  "standing-water": "irrigation-inspection",
  "dry-soil": "irrigation-inspection",
  "weed-growth": "crop-health",
};

function resolveDroneMissionTypeForIssue(issueType: CropIssueType | null): MissionType {
  if (issueType && DRONE_MISSION_TYPE_FOR_ISSUE[issueType]) return DRONE_MISSION_TYPE_FOR_ISSUE[issueType]!;
  return "crop-health";
}

/**
 * AURA Natural-Language-Actions phase, Parts 2–9 — the full decision tree
 * behind "Check field A" / "There are bugs eating my crops in field B":
 *
 *  1. Resolve the target field from real Plot Store data (never guessed —
 *  Part 4/9: ask a clarifying question when the farm has more than one
 *  field and none was named; a single-field farm has no ambiguity).
 *  2. Map any reported problem keyword to a real `CropIssueType` —
 *  `null` for a general "check field A" with no described problem.
 *  3. PREFER an available ROBOT whenever it can genuinely resolve the
 *  reported problem, or (no problem reported) run a general
 *  crop-inspection — strictly more capable than a drone (detect AND
 *  resolve vs. detect-only), so it wins whenever one is free. This is a
 *  deterministic rule, not a question put to the Farmer (Part 6's own
 *  opening line: "The farmer should not need to understand the
 *  technical capabilities of the fleet" — Part 9: minimum necessary
 *  questions).
 *  4. Otherwise fall back to an available DRONE for a survey-only pass —
 *  covers both "no robot is free right now" and "the reported problem
 *  has no robot capability at all" (still worth a look).
 *  5. If nothing is available at all, an honest refusal (Part 6's own
 *  worked example, quoted directly).
 *
 * Returns an UNRECORDED `ActionResult` — every caller wraps it in
 * `recordAndReturn` (mirrors every other handler in this file).
 */
/**
 * AURA Intelligence phase — resolves a free-text field reference (as the LLM
 * intent-classifier echoed it back, e.g. "Field A") against real Plot Store
 * labels. Tries an exact case-insensitive match first, then normalizes a
 * leading "field" to "plot" (every real plot in this app is labeled "Plot
 * <letter>", but farmers naturally say "field") and retries. Returns
 * `undefined` — never a guessed/nearest match — if nothing real matches.
 */
function resolvePlotLabelToId(label: string): string | undefined {
  const needle = label.trim().toLowerCase();
  if (!needle) return undefined;
  const plots = Object.values(usePlotStore.getState().plots);
  const exact = plots.find((plot) => plot.label.toLowerCase() === needle);
  if (exact) return exact.id;
  const asPlotWord = needle.replace(/^field\b/, "plot");
  const viaPlotWord = plots.find((plot) => plot.label.toLowerCase() === asPlotWord);
  return viaPlotWord?.id;
}

/** The verb AURA uses in its own proposal text, matching the mission intent so a patrol reads like a patrol and a resolution reads like a resolution, never all flattened to "inspect." */
function intentVerbPhrase(missionIntent: MissionIntentKind, plotLabel: string): string {
  if (missionIntent === "patrol") return `patrol ${plotLabel}`;
  if (missionIntent === "investigate") return `investigate ${plotLabel}`;
  if (missionIntent === "resolve") return `resolve the issue in ${plotLabel}`;
  return `inspect ${plotLabel}`;
}

async function handleFieldInspectionRequest(
  requestedPlotId: string | undefined,
  reportedProblemKeyword: string | undefined,
  requestedVehicleKind?: "robot" | "drone",
  missionIntent: MissionIntentKind = "inspect",
): Promise<ActionResult> {
  const plots = Object.values(usePlotStore.getState().plots);

  let targetPlot: { id: string; label: string } | undefined;
  if (requestedPlotId) {
    targetPlot = plots.find((plot) => plot.id === requestedPlotId);
    if (!targetPlot) {
      const knownLabels = plots.length > 0 ? plots.map((plot) => plot.label).join(", ") : "none configured yet";
      return { success: false, message: `I don't see a field matching that on this farm. The real fields here are: ${knownLabels}.` };
    }
  } else if (plots.length === 1) {
    targetPlot = plots[0];
  } else if (plots.length === 0) {
    return { success: false, message: "This farm doesn't have any fields configured yet." };
  } else {
    // Part 4/9 — minimum necessary question: never guess which field.
    return { success: true, message: "Sure — which field would you like me to check?" };
  }

  if (!targetPlot) {
    // Unreachable given the if/else-if/else chain above (every branch
    // either assigns `targetPlot` or returns) — kept as an honest runtime
    // guard, matching this file's own convention, rather than a non-null
    // assertion.
    return { success: false, message: "I couldn't determine which field to inspect." };
  }

  // AURA Intelligence phase, Part 19 — mission-aware reasoning: never
  // propose/create a new mission for a field that already has one actively
  // running, whichever vehicle kind it is. Reuses the exact same "active"
  // definitions the rest of this file already uses for mission-status
  // queries — never a second, competing notion of "active."
  const activeRobotMission = Object.values(useRobotMissionStore.getState().missions).find(
    (mission) => mission.targetPlotId === targetPlot!.id && ROBOT_MISSION_ACTIVE_STATUSES.includes(mission.status),
  );
  if (activeRobotMission) {
    const robotName = activeRobotMission.assignedRobotId ? useRobotStore.getState().robots[activeRobotMission.assignedRobotId]?.name : undefined;
    return {
      success: true,
      message: `${targetPlot.label} already has an inspection mission running${robotName ? ` (${robotName})` : ""} — I don't recommend starting another one. I'll let you know if you ask me to check again once it's done.`,
    };
  }
  const activeDroneMission = Object.values(useMissionStore.getState().missions).find(
    (mission) => mission.targetPlotId === targetPlot!.id && MISSION_FLIGHT_STATUSES.includes(mission.status),
  );
  if (activeDroneMission) {
    const droneName = activeDroneMission.assignedDroneId ? useFleetStore.getState().drones[activeDroneMission.assignedDroneId]?.name : undefined;
    return {
      success: true,
      message: `${targetPlot.label} already has a drone survey running${droneName ? ` (${droneName})` : ""} — I don't recommend starting another one right now.`,
    };
  }

  const issueType = reportedProblemKeyword ? mapKeywordToIssueType(reportedProblemKeyword) : null;
  const confirmationRequired = useFarmerSettingsStore.getState().actionConfirmationRequired;

  // "resolve" is the one intent that can ACTUALLY
  // perform a corrective action, not merely detect one, so it's the one
  // place this must refuse rather than silently downgrade: never create a
  // "resolve" mission for an issue with no real capability behind it
  // (`ROBOT_ISSUE_CAPABILITIES`, `findings/types.ts` — the SAME map every
  // other resolution decision in this app already defers to). A "resolve"
  // request naming no real problem at all has nothing to resolve either.
  if (missionIntent === "resolve") {
    const capable = issueType && isRobotCapableIssue(issueType);
    if (!capable) {
      const whatProblem = issueType ? CROP_ISSUE_TYPE_LABELS[issueType].toLowerCase() : (reportedProblemKeyword ?? "that problem");
      return {
        success: false,
        message: `I can send a vehicle to investigate ${whatProblem} in ${targetPlot.label}, but I don't currently have an authorized treatment action for it. Would you like me to send someone to investigate instead?`,
      };
    }
  }

  // PATROL never targets a specific problem (routine
  // surveillance, not an investigation), so it always uses the dedicated
  // patrol/survey mission type regardless of any problem keyword that
  // happened to also be in the sentence.
  const robotMissionType: RobotMissionType =
    missionIntent === "patrol"
      ? "autonomous-patrol"
      : ((issueType && isRobotCapableIssue(issueType) ? resolveRobotMissionTypeForIssue(issueType) : null) ?? "crop-inspection");
  const availableRobot = Object.values(useRobotStore.getState().robots).find(
    (robot) => FREE_ROBOT_STATUSES.includes(robot.status) && robot.activeMissionId === null,
  );
  const droneMissionType: MissionType = missionIntent === "patrol" ? "survey" : resolveDroneMissionTypeForIssue(issueType);
  const availableDrone = Object.values(useFleetStore.getState().drones).find(
    (drone) => FREE_DRONE_STATUSES.includes(drone.status) && drone.activeMissionId === null,
  );

  const proposalVerb = intentVerbPhrase(missionIntent, targetPlot.label);

  function proposeOrExecuteRobot(notePrefix?: string): Promise<ActionResult> | ActionResult {
    if (!confirmationRequired) return executeRobotFieldInspectionMission(targetPlot!, robotMissionType, availableRobot!);
    const pending: Omit<PendingFieldInspectionAction, "proposedAt"> = {
      kind: "field-inspection",
      plotId: targetPlot!.id,
      plotLabel: targetPlot!.label,
      vehicleKind: "robot",
      robotMissionType,
      robotId: availableRobot!.id,
      reportedProblemKeyword,
      missionIntent,
    };
    usePendingActionStore.getState().propose(pending);
    return {
      success: true,
      message: `${notePrefix ?? ""}I can send ${availableRobot!.name} to ${proposalVerb} (${ROBOT_MISSION_TYPE_LABELS[robotMissionType]}). Would you like me to start it?`,
    };
  }

  function proposeOrExecuteDrone(notePrefix?: string): Promise<ActionResult> | ActionResult {
    if (!confirmationRequired) return executeDroneFieldInspectionMission(targetPlot!, droneMissionType, availableDrone!);
    const pending: Omit<PendingFieldInspectionAction, "proposedAt"> = {
      kind: "field-inspection",
      plotId: targetPlot!.id,
      plotLabel: targetPlot!.label,
      vehicleKind: "drone",
      droneMissionType,
      droneId: availableDrone!.id,
      reportedProblemKeyword,
      missionIntent,
    };
    usePendingActionStore.getState().propose(pending);
    return {
      success: true,
      message: `${notePrefix ?? ""}The available drone (${availableDrone!.name}) can ${proposalVerb} (${MISSION_TYPE_LABELS[droneMissionType]}). Would you like me to start the scan?`,
    };
  }

  // Respect an EXPLICIT farmer vehicle preference where a suitable, available unit
  // of that kind actually exists; never invent one that doesn't. If the
  // requested kind isn't available, offer the other real available kind
  // instead — with an honest note explaining the substitution — rather than
  // silently switching without saying so, or flatly refusing when a genuine
  // alternative exists.
  if (requestedVehicleKind === "drone") {
    if (availableDrone) return proposeOrExecuteDrone();
    if (availableRobot) return proposeOrExecuteRobot("No drone is available right now, but a robot is — ");
    return { success: false, message: "I can't start the inspection right now because no drone is available, and no other suitable vehicle is available either." };
  }
  if (requestedVehicleKind === "robot") {
    if (availableRobot) return proposeOrExecuteRobot();
    if (availableDrone) return proposeOrExecuteDrone("No ground robot is available right now, but a drone is — ");
    return { success: false, message: "I can't start the inspection right now because no robot is available, and no other suitable vehicle is available either." };
  }

  // No preference stated — Part 6's original deterministic rule: a capable,
  // available robot wins first (it can both detect AND resolve, strictly
  // more capable than a drone), falling back to a drone survey otherwise.
  if (availableRobot) return proposeOrExecuteRobot();
  if (availableDrone) return proposeOrExecuteDrone();

  // Part 6's own worked example, quoted directly.
  return { success: false, message: "I can't start the inspection right now because no suitable vehicle is available." };
}

/**
 * A farmer correcting an ALREADY-PROPOSED vehicle
 * ("Use the drone instead.") without repeating the whole request. Re-runs
 * `handleFieldInspectionRequest` with the SAME plot/problem/intent the
 * original proposal carried (see `PendingFieldInspectionAction`'s own doc
 * comment) and only the vehicle preference changed — never a fresh guess at
 * what the farmer originally wanted, and fully re-validated from scratch
 * (availability, capability) exactly like any other proposal.
 */
async function resolveVehicleOverride(overrideVehicleKind: "robot" | "drone" | undefined): Promise<ActionResult> {
  if (!overrideVehicleKind) {
    return { success: false, message: "I didn't catch which vehicle you'd like to use — try \"use the drone\" or \"use the robot.\"" };
  }
  const pending = usePendingActionStore.getState().pending;
  if (!pending || pending.kind !== "field-inspection") {
    return { success: false, message: "I don't have a pending mission proposal to change the vehicle for — tell me what you'd like checked first." };
  }
  // Cleared defensively before re-resolving: if the override itself can't be
  // satisfied (e.g. neither vehicle turns out available), the OLD proposal
  // must not linger as if it were still the live one.
  usePendingActionStore.getState().clear();
  return handleFieldInspectionRequest(pending.plotId, pending.reportedProblemKeyword, overrideVehicleKind, pending.missionIntent ?? "inspect");
}

function recordAndReturn(command: ParsedCommand, result: ActionResult): ActionResult {
  useActionHistoryStore.getState().record({
    label: command.label ?? command.commandId ?? "Unknown action",
    success: result.success,
    timestamp: Date.now(),
  });
  return result;
}
