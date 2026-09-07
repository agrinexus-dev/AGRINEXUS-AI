/**
 * Shared AURA types — imported by both server (API routes, providers) and
 * client (stores, UI) code, so this module must stay free of any
 * server-only or client-only imports.
 */

// A type-only import
// (erased at compile time, so this stays a genuinely shared module):
// `language-detection.ts` carries no "use client"/"server-only" directive
// of its own, and reusing its existing two-value `ConversationLanguage`
// type here (rather than inventing a second English/Urdu taxonomy) is
// exactly the "reuse an existing canonical type" rule.
import type { ConversationLanguage } from "./voice/language-detection";

/** How many of the most recent Crop Inspection Findings `collect-context.ts` includes in `AuraContext.cropFindings` — shared with `prompt-builder.ts` (which needs the exact number to warn the model this list can be truncated) so the two never drift apart. */
export const MAX_FINDINGS_IN_CONTEXT = 10;

/**
 * How many
 * COMPLETED/CANCELLED missions (per vehicle kind) `prompt-builder.ts`
 * includes by default alongside every still-active mission (which is never
 * capped — an in-progress mission is always fully relevant). Unlike
 * `MAX_FINDINGS_IN_CONTEXT`, this cap is capping RENDERING only — the full
 * mission list `collect-context.ts` collects into `AuraContext` is
 * untouched, so nothing about the farm's real authoritative state is lost;
 * a message the task router classifies as a genuine history question (see
 * `routing/task-router.ts`'s `history_query` category) gets the FULL,
 * uncapped mission history instead of this default. Kept in `types.ts`
 * (shared, not private to `prompt-builder.ts`) for the same reason
 * `MAX_FINDINGS_IN_CONTEXT` already is.
 */
export const MAX_COMPLETED_MISSIONS_IN_CONTEXT = 5;

export type AuraRole = "user" | "assistant" | "system";

/**
 * The ONE, minimal
 * extension point for a Farmer-attached image. Deliberately a field ON
 * `AuraMessage` rather than a parallel `ImageMessage`/`MultimodalMessage`
 * type ("do not create a parallel architecture if the existing
 * canonical request can safely support multimodal content") — every
 * existing consumer of `AuraMessage[]` (`buildMessagesForProvider`,
 * `history-summary.ts`, `context-selector.ts`, the Groq/OpenRouter
 * adapters) already reads only `.content`/`.role`/`.id`/`.createdAt` and
 * simply ignores an extra property it doesn't know about — no other file
 * needed to change for this field to travel unmodified through the entire
 * existing pipeline (`buildMessagesForProvider` spreads history messages
 * as-is; see that function's own doc comment). Only `gemini-provider.ts`'s
 * `toGeminiPayload` (the sole place that actually needs to DO something
 * with it) and the new `image-validation.ts` (server) / `prepare-image-
 * attachment.ts` (client) know this field exists at all.
 *
 * `dataBase64` is the RAW base64 payload only (no `data:image/...;base64,`
 * prefix) — matches Gemini's own `inline_data.data` field shape exactly,
 * so `toGeminiPayload` can pass it straight through with no reformatting.
 * Present only on the user message that actually carries the attachment;
 * `undefined` (never a placeholder object) on every other message,
 * including this same message's own eventual assistant reply.
 */
export interface AuraImageAttachment {
  mimeType: string;
  dataBase64: string;
}

export interface AuraMessage {
  id: string;
  role: AuraRole;
  content: string;
  createdAt: number;
  image?: AuraImageAttachment;
}

/**
 * The structured "what does the farmer actually want" categorization every
 * natural-language field-operation request resolves into, BEFORE it's
 * turned into a real `RobotMissionType`/`MissionType` (the enums the
 * mission stores already use — this is deliberately a layer ABOVE those,
 * never a replacement or a second mission-type system):
 *  - "inspect": a general check with no specific problem named ("Check
 *  field A.").
 *  - "patrol": routine surveillance, not tied to any specific problem
 *  ("Patrol field A.", "Have the robot watch field B.").
 *  - "investigate": a specific, already-suspected problem, purely to look
 *  into it ("Check the pest problem in field B.").
 *  - "resolve": the farmer wants the problem actually addressed, not just
 *  looked at ("Fix the weed problem.", "Deal with the irrigation issue.")
 *  — only ever allowed to proceed as a real corrective mission when the
 *  issue type has a genuine capability in `ROBOT_ISSUE_CAPABILITIES`
 *  (`findings/types.ts`); otherwise the farmer is told plainly that only
 *  investigation is currently possible (never fake a
 *  resolution).
 * Resolved once, deterministically, in `command-parser.ts`'s
 * `detectMissionIntent` — the LLM never assigns this itself.
 */
export type MissionIntentKind = "inspect" | "patrol" | "investigate" | "resolve";

/**
 * Identifies exactly one real
 * mission in exactly one of the two existing mission stores. Never a
 * standalone record of its own (Security rule 34 — "do not create a second
 * mission state machine"): every consumer resolves this id against the
 * REAL `useRobotMissionStore`/`useMissionStore` at read time, so a mission
 * card always reflects genuinely-current state, never a frozen snapshot.
 * Deliberately client-side/in-session-only — see `aura-chat-store.ts`'s
 * `missionRefsByMessageId` doc comment for why this is never persisted to
 * the `AuraMessage` database row.
 */
export interface AuraMissionRef {
  vehicleKind: "robot" | "drone";
  missionId: string;
}

// "groq" added as a second REAL provider, used both as an
// explicit user selection (AURA Settings) and as the automatic fallback
// target when OpenRouter fails with a temporary/recoverable error (see
// `app/api/aura/chat/route.ts`).
export const PROVIDER_IDS = ["gemini", "openrouter", "groq", "openai", "claude", "ollama"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderConnectionStatus = "connected" | "not-configured" | "error" | "coming-soon";

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  models: string[];
  /** Whether this provider has a real implementation this change (only Gemini does — everything else is a stub). */
  implemented: boolean;
}

/**
 * Structured application context, collected fresh before every AI request
 * (see `context/collect-context.ts`) and folded into the system prompt (see
 * `prompt/prompt-builder.ts`). Each domain below is `null`/omitted wherever
 * no real value exists anywhere in the app — the Context Engine never
 * fabricates a value to fill a gap. Two kinds of
 * source feed this:
 *  - dynamic slices published into `context/live-context-store.ts` by the
 *  module that owns that state (Mission Control's workspace, the Digital
 *  Twin page, the autonomous units) — these change at runtime.
 *  - static values imported directly from the component that already
 *  defines them (dashboard widgets, `intelligence-data.ts`) — these are
 *  fixed mock data today, read once, never duplicated into a second copy.
 */
export interface AuraContext {
  currentPage: string;
  userRole: string | null;
  timestamp: string;
  /**
   * The Farmer's AURA-reply-language preference
   * (`farmer-settings-store.ts`'s `auraLanguage`), `null` for English (no
   * instruction needed — every existing behavior is unaffected) or when
   * nothing has ever set it. A real, honest use of the already-integrated
   * LLM's own language ability (see `prompt-builder.ts`), not a second
   * hand-rolled translation system — Part 27 explicitly forbids the latter.
   */
  preferredLanguage: string | null;
  /**
   * `true` only
   * when `preferredLanguage` above was just set from the Farmer's OWN
   * EXPLICIT per-image-turn choice (`chat-input.tsx`'s language picker),
   * server-validated in `app/api/aura/chat/route.ts`; `undefined`/falsy
   * for every other case, including the automatic per-turn text detection
   * that already drives `preferredLanguage` for a normal message (see that
   * field's own doc comment) — that existing behavior is completely
   * unaffected by this flag.
   *
   * Exists because live testing found that an explicit choice and an
   * AUTOMATICALLY DETECTED preference need different prompt treatment:
   * automatic detection should stay permissive ("respond in X unless the
   * user actually wrote in Y" — the right behavior when X is only ever a
   * guess), but an explicit choice IS the Farmer's own stated intent, not
   * a guess to defer to — `prompt-builder.ts`'s `languageInstructionFor`
   * reads this flag to skip its own "unless the user writes in a
   * different language" escape hatch only in that one explicit case. A
   * request-scoped boolean on this same, already-request-scoped,
   * never-persisted context object — not a new global/Settings/database
   * field (the explicit rule).
   */
  preferredLanguageExplicit?: boolean;

  missionControl: {
    farmHealth: string | null;
    fleetReadiness: string | null;
    criticalAlerts: string | null;
    aiConfidence: string | null;
    missionStatus: string | null;
    weatherSummary: string | null;
    dashboardState: string | null;
    presentationMode: boolean | null;
    demoMode: boolean | null;
    activeWidgets: string[] | null;
  };

  digitalTwin: {
    selectedEntity: { id: string; type: string; label: string; meta: string } | null;
    hoveredEntity: { id: string; type: string; label: string } | null;
    weatherPreset: string | null;
    visibleLayers: string[] | null;
    enabledIntelligenceLayers: string[] | null;
    cameraMode: "free" | "follow-drone" | "follow-robot" | null;
    simulationState: string | null;
  };

  /**
   * Every drone the Fleet Store holds — replaces the old
   * single hardcoded `droneFleet` entry. Sourced directly from
   * `lib/fleet/fleet-store.ts` (the fleet's own single source of truth),
   * not mirrored through `live-context-store.ts`. Empty array, never
   * fabricated, if the fleet has no drones.
   */
  drones: {
    id: string;
    name: string;
    droneType: string;
    cameraType: string;
    status: string;
    batteryPercent: number;
    speedMps: number;
    altitude: number;
    position: { x: number; z: number };
    /** This drone's fixed home/patrol-origin point, distinct from its current live `position`. */
    homeLocation: { x: number; z: number };
    currentWaypointLabel: string;
    health: string;
    signalPercent: number;
    flightHours: number;
    /**
     * WHY this drone is currently in `status`, computed
     * the same way `autonomous/autonomous-behavior.ts`'s own reconciliation
     * priority decides it (active mission > claimed by an enabled recurring
     * schedule > autonomous toggle > idle default), so AURA can answer "Why
     * isn't Drone Alpha patrolling?" from a REAL classification rather than
     * guessing from `status` alone. One of: "on-mission",
     * "recurring-schedule", "autonomous-patrol", "autonomous-disabled",
     * "manual" (paused/returning/maintenance/offline — an explicit operator
     * action, not one of the above).
     */
    activityReason: string;
  }[];

  /**
   * Every mission the Mission Store holds, sourced directly
   * from `lib/missions/mission-store.ts` — not mirrored through
   * `live-context-store.ts`, same convention `drones` above already
   * follows. Empty array, never fabricated, if no missions exist yet.
   */
  missions: {
    id: string;
    name: string;
    missionType: string;
    status: string;
    targetPlotLabel: string | null;
    assignedDroneName: string | null;
    progressPercent: number;
    coverageProgressPercent: number;
    estimatedDurationMinutes: number | null;
    estimatedBatteryPercent: number | null;
    estimatedImageCount: number | null;
    /** Real start/completion times so AURA can answer "when did it finish?" precisely (e.g. "at 3:42 PM") instead of only a status word. `null` until the mission actually reaches that point — never fabricated. */
    startedAt: string | null;
    completedAt: string | null;
  }[];

  /**
   * Every ground robot the Robot Store holds, sourced directly
   * from `lib/robots/robot-store.ts` — mirrors `drones` above exactly.
   * Replaces the old single hardcoded `robotFleet` entry, the same
   * generalization already applied to drones. Empty array, never
   * fabricated, if the fleet has no robots.
   */
  robots: {
    id: string;
    name: string;
    robotType: string;
    status: string;
    batteryPercent: number;
    speedMps: number;
    position: { x: number; z: number };
    /** This robot's fixed home/patrol-origin point, distinct from its current live `position`. */
    homePosition: { x: number; z: number };
    health: string;
    connectionQuality: string;
    signalPercent: number;
    currentMissionLabel: string | null;
    currentMissionTargetLabel: string | null;
    /** Mirrors `drones[].activityReason` exactly, for ground robots. */
    activityReason: string;
  }[];

  /**
   * Every robot mission the Robot Mission Store holds, sourced
   * directly from `lib/robot-missions/robot-mission-store.ts` — mirrors
   * `missions` above exactly, but for ground robots. Empty array, never
   * fabricated, if no robot missions exist yet.
   */
  robotMissions: {
    id: string;
    name: string;
    missionType: string;
    status: string;
    targetPlotLabel: string | null;
    assignedRobotName: string | null;
    progressPercent: number;
    coverageProgressPercent: number;
    estimatedDurationMinutes: number | null;
    estimatedBatteryPercent: number | null;
    estimatedDistanceMeters: number | null;
    /** Mirrors `missions[].startedAt`/`completedAt` above, for ground robot missions. */
    startedAt: string | null;
    completedAt: string | null;
  }[];

  /**
   * Every sensor the Sensor Store holds, sourced directly from
   * `lib/sensors/sensor-store.ts` — mirrors `robots` above exactly. A
   * SEPARATE concept from `sensorNetwork` below, which stays fed by the
   * older static `intelligence-data.ts` array (untouched this change).
   */
  sensors: {
    id: string;
    name: string;
    sensorType: string;
    status: string;
    health: string;
    batteryPercent: number;
    signalPercent: number;
    currentReading: string;
    position: { x: number; z: number };
    assignedPlotLabel: string | null;
    gateway: string;
    /**
     * A compact summary of this sensor's HISTORICAL (Historical Store)
     * readings ("AURA General Context") — deliberately just a
     * few summary numbers per sensor, never the raw sample array, so
     * general chat context stays small regardless of how much history has
     * accumulated. `null` when the sensor doesn't have enough recorded
     * history yet for the summary window to mean anything (never a
     * fabricated stand-in).
     */
    history: {
      average: number;
      min: number;
      max: number;
      trendDirection: string;
      rateOfChangePerHour: number;
      anomalyDetected: boolean;
      /** Which window these numbers cover — always "Last 24 Hours" for the always-on general context (a longer/specific range is available on demand via AURA's sensor-trend/sensor-statistics commands). */
      rangeLabel: string;
    } | null;
  }[];

  /**
   * The Agricultural Reasoning Engine's current recommendation for every
   * real farm plot ("Agricultural Reasoning Engine" +
   * "AURA Reasoning") — sourced from `lib/sensor-analytics/reasoning-
   * engine.ts` via `lib/sensor-analytics/mission-integration.ts`'s
   * `getAllPlotRecommendations()`, ranked worst-first. Lets AURA answer
   * "What should we do about Plot A?"/"Which fields need irrigation?" from
   * general chat, not only via the dedicated `plot-recommendation`/
   * `fields-needing-*` commands. Empty array only if the farm has no plots
   * at all (never fabricated).
   */
  plotRecommendations: {
    plotId: string;
    plotLabel: string;
    action: string;
    reason: string;
    confidence: string | null;
    sourceSensors: string[];
  }[];

  /**
   * Real drone/robot mission findings (never
   * fabricated; empty array if no mission has detected anything yet),
   * sourced from `lib/findings/finding-store.ts`. Capped to the most recent
   * `MAX_FINDINGS_IN_CONTEXT` (see `collect-context.ts`) for the same
   * "don't grow the prompt unboundedly" reason `alerts` above is capped.
   */
  cropFindings: {
    plotLabel: string;
    issueType: string;
    severity: string;
    status: string;
    description: string;
    detectedByMissionName: string;
    detectedAt: string;
    /** Ground-plane (x, z) in the Digital Twin's scene coordinate system, the same one every other position field in this context uses (drones/robots/sensors). */
    position: { x: number; z: number };
    /** "drone" or "robot": which vehicle kind detected this finding, straight from `CropFinding.detectionMethod` — lets AURA distinguish "what have the drones detected" from "what have the robots detected" without guessing from the mission name. */
    detectionMethod: string;
    /** Whether a robot actually performed the corrective action (`correctiveActionType` set), distinct from merely being marked `resolved` some other way — never claim a robot fixed something it didn't. */
    resolvedByRobot: boolean;
  }[];

  /**
   * Every plot on the farm, sourced directly from the Plot
   * Store — the same store `plot-analytics-card.tsx`'s selector reads from.
   * Lets AURA answer "which plots need the most attention"/"which plot has
   * the most active issues" from real per-plot finding counts rather than
   * only the Reasoning Engine's sensor-based `plotRecommendations` below.
   * Empty array only if the farm has no plots at all.
   */
  plots: {
    id: string;
    label: string;
    growthStage: string;
    sensorCount: number;
    activeFindingCount: number;
    resolvedFindingCount: number;
  }[];

  /**
   * Every recurring mission schedule, sourced directly from
   * the Recurring Mission Store — the same store the Mission Planner's
   * "Recurring" tab and its own scheduler read/write. `state` is a plain-
   * language summary ("running now" / "scheduled" / "disabled") mirroring
   * `list-recurring-missions`'s own deterministic-command wording exactly,
   * so AURA's natural-language answer never contradicts what that command
   * would report. Empty array only if none have been created yet.
   */
  recurringMissions: {
    id: string;
    name: string;
    vehicleKind: string;
    missionTypeLabel: string | null;
    /** The real assigned drone/robot's name, resolved from the matching Fleet/Robot Store id — `null` only if the assignment is genuinely unset. */
    assignedVehicleName: string | null;
    targetPlotLabel: string | null;
    intervalMinutes: number;
    enabled: boolean;
    state: string;
    /** ISO string, or `null` if no run is currently scheduled (e.g. disabled, or a run is in flight). */
    nextRunAt: string | null;
  }[];

  /**
   * The two global autonomous-behavior toggles, read
   * straight from `useFleetStore`/`useRobotStore`'s own `autonomousEnabled`
   * flag — the exact same source `show-autonomous-status` reports from.
   */
  autonomous: {
    droneEnabled: boolean;
    robotEnabled: boolean;
  };

  /**
   * The canonical robot issue-capability map,
   * sourced directly from `lib/findings/types.ts`'s `ROBOT_ISSUE_CAPABILITIES`
   * — the ONLY place in the app that decides which crop issue types a robot
   * can resolve. Lists every `CropIssueType`, never a second/competing
   * classification, so AURA's "which issues cannot currently be resolved by
   * robots?" answer always agrees with what the Robot Mission Planner's own
   * capability breakdown UI shows.
   */
  robotCapabilities: {
    issueType: string;
    issueTypeLabel: string;
    robotResolvable: boolean;
    /** The real corrective-action label a capable robot performs — `null` for a non-resolvable issue type. */
    actionType: string | null;
  }[];

  /**
   * Real weather (Open-Meteo, farm-scoped by real coordinates),
   * sourced directly from `lib/weather/weather-store.ts`. `preset` is a
   * SEPARATE, older, purely cosmetic concept (which Digital-Twin sky/rain
   * visual the operator picked — `digital-twin/scene/weather.ts`) and is
   * left untouched here; every other field below is real-data-or-null,
   * never fabricated. `dataAvailable` is `false` for both "farm location
   * not configured" and "provider unreachable" — `unavailableReason`
   * disambiguates which, so AURA can answer honestly either way.
   */
  weather: {
    preset: string | null;
    locationConfigured: boolean;
    dataAvailable: boolean;
    unavailableReason: string | null;
    temperatureC: number | null;
    apparentTemperatureC: number | null;
    conditionText: string | null;
    humidityPercent: number | null;
    windKmh: number | null;
    windDirectionCompass: string | null;
    rainProbability: string | null;
    forecastSummary: string | null;
    tomorrowForecastSummary: string | null;
    droneOperatingCondition: string | null;
    droneOperatingReason: string | null;
    robotOperatingCondition: string | null;
    robotOperatingReason: string | null;
    irrigationConsideration: string | null;
    lastUpdated: string | null;
    dataSource: string | null;
    stale: boolean;
  };

  sensorNetwork: {
    soilMoisturePercent: number | null;
    temperatureC: number | null;
    humidityPercent: number | null;
    wind: string | null;
    rain: string | null;
    ec: string | null;
    ph: string | null;
    lightLevel: string | null;
    nodesOnline: string | null;
    signal: string | null;
    sensorCount: number | null;
  };

  analytics: {
    yieldPrediction: string | null;
    cropHealthSummary: string | null;
    diseaseRiskSummary: string | null;
    waterUsage: string | null;
    energyUsage: string | null;
    latestSummary: string | null;
  };

  alerts: {
    count: number;
    /** Total RESOLVED alerts in the Alert Store (this list itself only ever holds active ones — see `latest`'s own doc). */
    resolvedCount: number;
    latest: {
      severity: string;
      title: string;
      description: string;
      timestamp: string;
      /** Non-null only for a `crop-finding` alert, straight from `SensorAlertRecord.findingIssueType`/`findingPlotLabel` — lets AURA match an alert to its originating Crop Inspection Finding without guessing from free text. */
      findingIssueType: string | null;
      findingPlotLabel: string | null;
    }[];
  };
}

/**
 * Structured details a command's Action Executor needs beyond the label —
 * populated by `command-parser.ts`, consumed by `actions/action-executor.ts`
 * Optional/untyped-per-field on purpose: most commands need
 * none of these; each executor handler reads only the field(s) its own
 * action cares about.
 */
export interface ParsedCommandParams {
  plotId?: string;
  /** The second plot id captured out of a "Compare Plot A and Plot B" command — `plotId` carries the first, this carries the second. Mirrors `secondaryUnitName` (Compare Sensors). */
  secondaryPlotId?: string;
  layerKey?: string;
  layerEnabled?: boolean;
  presentationEnabled?: boolean;
  pageTarget?: string;
  /** The name captured out of a "Locate Drone <name>" or a ground-robot command like "Pause Robot <name>" — resolved against the Fleet Store / Robot Store by the Action Executor, not here. Which store it's resolved against depends entirely on the commandId. */
  unitName?: string;
  /** Whether a "Maintenance Mode" command should enable or disable it — defaults to enabling unless the phrase contains an explicit disable/stop/exit/off word. */
  maintenanceEnabled?: boolean;
  /** The mission type captured out of a "Create <Type> Mission" (drone) or "Create <Type> Robot Mission" (robot) command — a plain string matching one of `MissionType`'s or `RobotMissionType`'s values, not imported as either type so `command-parser.ts` stays store-free; the Action Executor validates it against whichever store the commandId targets. */
  missionType?: string;
  /** The mission name captured out of a drone mission-control/mission-query command or a robot-mission equivalent — undefined means "the currently selected mission", resolved by the Action Executor against the matching store (Mission Store or Robot Mission Store, per commandId). */
  missionName?: string;
  /** The second sensor name/id captured out of a "Compare Sensors A and B" command — `unitName` carries the first, this carries the second. */
  secondaryUnitName?: string;
  /** A resolved `TimeRangeId` ("24h"/"7d"/"30d") captured out of a phrase like "over the last 7 days" ("Time Range Support") — `undefined` means no range was mentioned, so the Action Executor falls back to whatever the Historical Store already holds (unchanged prior behavior). Kept as a plain string (not `TimeRangeId`) so `command-parser.ts` stays store/type-free, same convention `missionType` above already follows. */
  timeRangeId?: string;
  /** Minutes between runs, captured out of a "...every 10 minutes"/"...every hour" phrase on a "Create a recurring..." command. */
  intervalMinutes?: number;
  /** "drone" or "robot", captured out of a "Create a recurring drone/robot..." command; which store (`useMissionStore` vs `useRobotMissionStore`) `missionType` above resolves against depends on this. */
  vehicleKind?: string;
  /** Set only on the "clarify-mission-vehicle" commandId: which lifecycle action was ambiguous ("Create a mission for Plot A" / "Start the mission" / "Stop the mission" — no "drone"/"robot" word, and page context couldn't resolve it either). The Action Executor's handler uses this to phrase its clarification question and to pick which stores to check for a final, store-based resolution attempt before actually asking. */
  ambiguousAction?: "create" | "start" | "stop";
  /**
   * AURA Natural-Language-Actions phase — the field/plot reference extracted
   * from a natural-language inspection request ("Check field A", "There are
   * bugs eating my crops in field B") if the message named one explicitly;
   * `undefined` when no field was named at all (the Action Executor then
   * either falls back to the farm's only plot, if it has just one, or asks
   * the Farmer to clarify — never guesses). A plain "plot-<letter>" id
   * string, same convention `plotId` above already uses; kept separate from
   * `plotId` since some existing `plotId`-consuming commands assume it's
   * always present.
   */
  requestedPlotId?: string;
  /**
   * The free-text problem keyword captured out of a natural-language issue
   * report ("insects", "weeds", "fungal", "water", "dry") — resolved against
   * the real `CropIssueType` capability map by the Action Executor, never
   * here (this file stays store/type-free). `undefined` when the request
   * didn't describe a specific problem (a general "check field A").
   */
  reportedProblemKeyword?: string;
  /**
   * AURA Intelligence phase — a free-text field reference produced ONLY by
   * the LLM intent-classifier fallback (`lib/aura/intent/`) when a farmer's
   * phrasing didn't match the deterministic parser's own explicit
   * "field/plot <letter>" pattern (e.g. "the north field", or a pronoun
   * resolved from recent conversation). This is UNTRUSTED model output —
   * the Action Executor resolves it against real Plot Store data before
   * ever using it, exactly like `requestedPlotId` above but starting from a
   * label instead of an already-confirmed id. Never both set at once: the
   * deterministic parser only ever sets `requestedPlotId`.
   */
  requestedPlotLabel?: string;
  /**
   * An EXPLICIT vehicle preference the farmer stated ("Can a drone check Field
   * B?", "Send the robot."). `undefined` means no preference was expressed
   * ("Check field A.", "Use whatever is available.") — the Action Executor
   * then applies its existing deterministic capability-driven selection
   * unchanged. When set, the Action Executor respects it where a suitable,
   * available vehicle of that kind actually exists; it never invents one
   * that isn't real (same validation as every other field here).
   */
  requestedVehicleKind?: "robot" | "drone";
  /**
   * See
   * `MissionIntentKind`'s own doc comment. Set by `command-parser.ts`'s
   * `detectMissionIntent` for every `request-field-inspection` command;
   * `undefined` only for commands that predate this change and never carried
   * one (the Action Executor treats a missing value as `"inspect"`, the
   * original, unchanged default behavior).
   */
  missionIntent?: MissionIntentKind;
  /**
   * A farmer correcting an ALREADY-PROPOSED vehicle choice
   * ("Use the drone instead.", "Send the robot.") without repeating the
   * whole request. Set only on the `override-pending-vehicle` commandId;
   * the Action Executor re-resolves the SAME pending plot/problem/intent
   * with this new preference — never a fresh guess at what the farmer
   * originally wanted.
   */
  overrideVehicleKind?: "robot" | "drone";
  /**
   * Every mission this
   * conversation has itself dispatched-and-tagged (see `aura-chat-store.ts`'s
   * `missionRefsByMessageId`) that MIGHT be the target of a pronoun-style
   * mission-control request ("Pause it.", "Cancel that mission.", "Stop the
   * robot."), most-recent-first, deduplicated by mission id. The Action
   * Executor is the one place that actually filters these down to what's
   * currently valid for the requested action (e.g. only a still-in-progress
   * one is pausable) and to a single unambiguous target — this is raw
   * candidate data, never a pre-resolved answer, so no guess happens here in
   * the store-free parser.
   */
  recentMissionRefs?: AuraMissionRef[];
}

export interface ParsedCommand {
  recognized: boolean;
  commandId?: string;
  label?: string;
  params?: ParsedCommandParams;
}

export interface ChatRequestBody {
  provider: ProviderId;
  model: string;
  temperature: number;
  stream: boolean;
  messages: AuraMessage[];
  context: AuraContext;
  /**
   * The Farmer's EXPLICIT,
   * request-scoped choice of which language AURA should answer in for THIS
   * image-analysis turn only (set by `chat-input.tsx`'s language picker,
   * threaded through `farmer-aura-page.tsx`'s `sendAndPersist` and
   * `aura-chat-store.ts`'s `sendMessage`). `undefined` for every normal
   * text turn — Operator's floating panel never sets this at all, and
   * text turns keep using the existing automatic per-turn
   * `context.preferredLanguage` detection completely unchanged (see that
   * field's own doc comment on `AuraContext`). This value is UNTRUSTED
   * client input: `app/api/aura/chat/route.ts` re-validates it through
   * this same file's `normalizeDetectedLanguage` allowlist before it's
   * ever allowed to override `context.preferredLanguage` for the image
   * request's own prompt construction — never persisted, never written to
   * any Settings/preference store.
   */
  imageResponseLanguage?: ConversationLanguage;
}

export interface ProviderStatusResponse {
  statuses: Record<ProviderId, ProviderConnectionStatus>;
}
