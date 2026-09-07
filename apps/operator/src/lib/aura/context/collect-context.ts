"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { computeFarmAnalyticsSummary } from "@/components/command-center/widgets/analytics-widget";
import { DASHBOARD_FARM_STATUS } from "@/components/command-center/widgets/aura-summary-widget";
import { DASHBOARD_ENERGY } from "@/components/command-center/widgets/energy-widget";
import { kpis } from "@/components/command-center/kpi-row";
import { MISSION_STATUS_TEXT } from "@/components/command-center/mission-status-banner";
import { farmPlots } from "@/components/digital-twin/scene/farm-data";
import {
  cropHealthCells,
  diseaseRiskByPlot,
  HEALTH_LABELS,
  irrigationZones,
  RISK_LABELS,
  sensors,
} from "@/components/digital-twin/scene/intelligence/intelligence-data";
import type { AppSessionUser } from "@/lib/auth/types";
import { FARMER_LANGUAGE_LABELS, useFarmerSettingsStore } from "@/lib/farmer/farmer-settings-store";
import { useFindingStore } from "@/lib/findings/finding-store";
import { CROP_ISSUE_TYPE_LABELS, CROP_ISSUE_TYPES, describeFindingStatus, ROBOT_ISSUE_CAPABILITIES } from "@/lib/findings/types";
import { useFleetStore } from "@/lib/fleet/fleet-store";
import { useMissionStore } from "@/lib/missions/mission-store";
import { MISSION_TYPE_LABELS } from "@/lib/missions/types";
import { usePlotStore } from "@/lib/plots/plot-store";
import { isVehicleClaimedByEnabledRecurring, useRecurringMissionStore } from "@/lib/recurring-missions/recurring-mission-store";
import { useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";
import { ROBOT_MISSION_TYPE_LABELS } from "@/lib/robot-missions/types";
import { useRobotStore } from "@/lib/robots/robot-store";
import { useAlertStore } from "@/lib/sensor-analytics/alert-store";
import { useHistoricalStore } from "@/lib/sensor-analytics/historical-store";
import { getAllPlotRecommendations } from "@/lib/sensor-analytics/mission-integration";
import { computeTrendStats, detectAnomalies } from "@/lib/sensor-analytics/trend-analysis";
import { ALERT_TYPE_LABELS, TIME_RANGE_MS } from "@/lib/sensor-analytics/types";
import { sensorPlotLabel, useSensorStore } from "@/lib/sensors/sensor-store";
import { formatSensorReading } from "@/lib/sensors/types";
import { degreesToCompass } from "@/lib/weather/format";
import { useWeatherStore } from "@/lib/weather/weather-store";

import { MAX_FINDINGS_IN_CONTEXT, type AuraContext } from "../types";
import { useLiveContextStore } from "./live-context-store";

// Simulation is always-on once any Digital Twin scene instance exists (the
// full page or the Command Center's live widget) — a fixed, honestly-static
// label matching what `StatusBar` itself always shows, not derived from a
// real health check.
const SIMULATION_STATE = "Running";

function findKpiValue(label: string): string | null {
  return kpis.find((kpi) => kpi.label === label)?.value?.toString() ?? null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function buildCropHealthSummary(): string {
  const counts = new Map<string, number>();
  for (const cell of cropHealthCells) counts.set(cell.status, (counts.get(cell.status) ?? 0) + 1);
  const parts = Array.from(counts.entries()).map(([status, count]) => `${count} ${HEALTH_LABELS[status as keyof typeof HEALTH_LABELS]}`);
  return `${parts.join(", ")} (of ${cropHealthCells.length} monitored zones)`;
}

function buildDiseaseRiskSummary(): string {
  const counts = new Map<string, number>();
  for (const plot of diseaseRiskByPlot) counts.set(plot.level, (counts.get(plot.level) ?? 0) + 1);
  const parts = Array.from(counts.entries()).map(([level, count]) => `${count} ${RISK_LABELS[level as keyof typeof RISK_LABELS]}`);
  return `${parts.join(", ")} (across ${diseaseRiskByPlot.length} plots)`;
}

function buildWaterUsageSummary(): string {
  const active = irrigationZones.filter((zone) => zone.active).length;
  return `${active} of ${irrigationZones.length} plots actively irrigating`;
}

function buildEnergyUsageSummary(): string {
  return `${DASHBOARD_ENERGY.solarOutputKw}kW solar generation, ${DASHBOARD_ENERGY.gridDrawKw}kW grid draw, ${DASHBOARD_ENERGY.todayKwh}kWh today, ${DASHBOARD_ENERGY.batteryPercent}% battery`;
}

const MAX_ALERTS_IN_CONTEXT = 5;

function formatAlertTimestamp(ms: number): string {
  const diffMinutes = Math.round((Date.now() - ms) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  return new Date(ms).toLocaleDateString();
}

/**
 * Real active alerts from the Alert Store — replaces the old
 * `dashboardAlerts` static demo array, which never agreed with the real
 * Alerts page/widget and was flagged as a duplicated source of truth in the
 * a schema audit. Capped at the `MAX_ALERTS_IN_CONTEXT` most recent
 * ACTIVE alerts (not the full history) for the same "don't grow the prompt
 * unboundedly" reason the sensor-history summary elsewhere in this file
 * already follows — a longer view is what the Alerts page itself is for.
 *
 * A `crop-finding` alert now carries its real
 * `findingId`/`findingIssueType`/`findingPlotLabel` linkage (already present
 * on `SensorAlertRecord`, unused by this builder until now) so AURA can
 * directly answer "which alert belongs to the fungal-risk finding?" from
 * structured data rather than parsing free text. Also reports
 * `resolvedCount` (Alert Store total, not just active) — this list only
 * ever holds ACTIVE alerts by design (matches the Alerts page's own default
 * view), so a finding shown as Resolved in the Crop Inspection Findings
 * section with no matching entry here means its alert was resolved too
 * (Part 12's lifecycle chain), never re-derived a second way.
 */
function buildAlertsSummary(): AuraContext["alerts"] {
  const all = Object.values(useAlertStore.getState().alerts);
  const active = all
    .filter((alert) => alert.resolvedAt === null)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ALERTS_IN_CONTEXT);

  return {
    count: active.length,
    resolvedCount: all.filter((alert) => alert.resolvedAt !== null).length,
    latest: active.map((alert) => ({
      severity: alert.severity,
      title:
        alert.alertType === "crop-finding"
          ? `Crop Finding — ${alert.findingPlotLabel ?? "unknown plot"} (${alert.findingIssueType ?? "unknown issue"})`
          : `${ALERT_TYPE_LABELS[alert.alertType]} — ${alert.sensorName}`,
      description: alert.message,
      timestamp: formatAlertTimestamp(alert.createdAt),
      findingIssueType: alert.findingIssueType,
      findingPlotLabel: alert.findingPlotLabel,
    })),
  };
}

/**
 * Root-cause fix for the "Critical Alerts" contradiction
 * found during the AURA capability audit: `missionControl.criticalAlerts`
 * used to read the Command Center's static `kpis` constant (a fixed "1"),
 * while `alerts.count` a few lines below always reflected the REAL Alert
 * Store. The two could — and, live, did — disagree in the same prompt (AURA
 * had to editorialize around its own contradiction: "1 (per Mission
 * Control; the Alerts panel currently lists 0 active alerts)"). This now
 * reads the SAME Alert Store `buildAlertsSummary()` above already uses,
 * filtered to `severity === "critical"` — the same definition
 * `analytics-service.ts`'s `activeCritical` aggregate uses server-side — so
 * both fields in this context always describe one consistent alert state.
 */
function countActiveCriticalAlerts(): string {
  const count = Object.values(useAlertStore.getState().alerts).filter(
    (alert) => alert.resolvedAt === null && alert.severity === "critical",
  ).length;
  return String(count);
}

/** Real, computed farm-analytics text ("Analytics Integration") — replaces the old hardcoded `DASHBOARD_YIELD_INSIGHT` yield claim. Reuses `computeFarmAnalyticsSummary()` (`analytics-widget.tsx`), the same function the dashboard widget itself renders, so AURA and the widget never disagree. */
function buildAnalyticsSummary(): string {
  const summary = computeFarmAnalyticsSummary();
  if (summary.sensorHealthAverage === null) return "Data unavailable — no sensors reporting yet.";
  const attentionCount = summary.plotsNeedingIrrigation + summary.plotsNeedingInspection;
  return [
    `Sensor network health ${summary.sensorHealthAverage}/100.`,
    attentionCount > 0
      ? `${attentionCount} plot(s) need attention (${summary.plotsNeedingIrrigation} irrigation, ${summary.plotsNeedingInspection} inspection).`
      : "No plots currently need irrigation or inspection.",
    `${summary.activeMissionCount} mission(s) active.`,
  ].join(" ");
}

/**
 * Collects structured application context for the AI request pipeline.
 * Called once per send, right before a message goes out (see
 * `client/aura-chat-store.ts`), so `timestamp` always reflects "now."
 *
 * Two kinds of source feed this, per module (see each domain below):
 *  - dynamic: read from `live-context-store`, published by whichever page
 *  owns that live state (Mission Control's workspace, the Digital Twin
 *  page, the autonomous units' poll).
 *  - static: imported directly from the dashboard widget / mock-data module
 *  that already defines it — read, never copied into a second value.
 * Any field with no real source anywhere in the app stays `null` — never
 * fabricated.
 */
export function useCollectAuraContext(): () => AuraContext {
  const pathname = usePathname();
  const { data: session } = useSession();

  return () => {
    // Read the store on demand rather than subscribing to it — this
    // callback only runs once per send, so there's no reason for every
    // hover/telemetry tick elsewhere in the app to rerender whatever
    // component called this hook (to avoid unnecessary rerenders).
    const live = useLiveContextStore.getState();
    const user = session?.user as AppSessionUser | undefined;
    // Read once here — reused below by both the `sensors`
    // array and the pre-existing `sensorNetwork` aggregate's `nodesOnline`/
    // `signal` fields, so neither recomputes the same snapshot twice.
    const sensorRecords = Object.values(useSensorStore.getState().sensors);
    // Read once here too ("AURA General Context") — the same
    // Historical Store samples the Sensor Analytics Center/AURA's trend
    // commands already read from, never a second copy.
    const historicalSamples = useHistoricalStore.getState().samples;
    const HISTORY_SUMMARY_RANGE_MS = TIME_RANGE_MS["24h"];
    // Read once here — reused below by `plots`, `cropFindings`,
    // and the drone/robot `activityReason` classification, never recomputed
    // per-field.
    const allFindings = Object.values(useFindingStore.getState().findings);
    const plotRecords = Object.values(usePlotStore.getState().plots);
    const droneAutonomousEnabled = useFleetStore.getState().autonomousEnabled;
    const robotAutonomousEnabled = useRobotStore.getState().autonomousEnabled;
    const weatherState = useWeatherStore.getState();

    /**
     * Mirrors `autonomous-behavior.ts`'s own reconciliation
     * priority (active mission > enabled recurring schedule > autonomous
     * toggle > idle default) as a pure READ, never duplicating its mutation
     * logic — this only classifies, it never calls a setter. Shared by both
     * the `drones` and `robots` mapping below.
     */
    function classifyVehicleActivity(kind: "drone" | "robot", id: string, activeMissionId: string | null, status: string, autonomousEnabled: boolean): string {
      if (activeMissionId !== null) return "on-mission";
      if (isVehicleClaimedByEnabledRecurring(kind, id)) return "recurring-schedule";
      const freeStatuses = kind === "drone" ? ["idle", "patrolling"] : ["idle", "active"];
      if (freeStatuses.includes(status)) return autonomousEnabled ? "autonomous-patrol" : "autonomous-disabled";
      return "manual";
    }

    return {
      currentPage: pathname,
      userRole: user?.role ?? null,
      timestamp: new Date().toISOString(),
      preferredLanguage: (() => {
        const language = useFarmerSettingsStore.getState().auraLanguage;
        return language === "english" ? null : FARMER_LANGUAGE_LABELS[language];
      })(),

      missionControl: {
        farmHealth: findKpiValue("Farm Health"),
        fleetReadiness: findKpiValue("Fleet Readiness"),
        criticalAlerts: countActiveCriticalAlerts(),
        aiConfidence: findKpiValue("AI Confidence"),
        missionStatus: MISSION_STATUS_TEXT,
        weatherSummary: weatherState.data
          ? `${weatherState.data.current.conditionText}, ${weatherState.data.current.temperatureC?.toFixed(0) ?? "—"}°C`
          : weatherState.locationConfigured === false
            ? "Farm location not configured"
            : "Unavailable",
        dashboardState: DASHBOARD_FARM_STATUS,
        presentationMode: live.missionControl.presentationMode,
        // No real Demo Mode exists yet — the dashboard's own toggle is a disabled "Coming soon" placeholder with no backing state.
        demoMode: null,
        activeWidgets: live.missionControl.activeWidgets,
      },

      digitalTwin: {
        selectedEntity: live.digitalTwin.selectedEntity,
        hoveredEntity: live.digitalTwin.hoveredEntity,
        weatherPreset: live.digitalTwin.weatherPreset,
        visibleLayers: live.digitalTwin.visibleLayers,
        enabledIntelligenceLayers: live.digitalTwin.enabledIntelligenceLayers,
        cameraMode: live.digitalTwin.cameraMode,
        simulationState: SIMULATION_STATE,
      },

      // Sourced directly from the Fleet Store — the single
      // source of truth for every drone — not from `live-context-store`,
      // which only ever knew about one hardcoded drone.
      drones: Object.values(useFleetStore.getState().drones).map((drone) => ({
        id: drone.id,
        name: drone.name,
        droneType: drone.droneType,
        cameraType: drone.cameraType,
        status: drone.status,
        batteryPercent: drone.batteryPercent,
        speedMps: drone.speedMps,
        altitude: drone.altitude,
        position: { x: drone.position[0], z: drone.position[1] },
        homeLocation: { x: drone.homeLocation[0], z: drone.homeLocation[1] },
        currentWaypointLabel: drone.currentWaypointLabel,
        health: drone.health,
        signalPercent: drone.signalPercent,
        flightHours: drone.flightHours,
        activityReason: classifyVehicleActivity("drone", drone.id, drone.activeMissionId, drone.status, droneAutonomousEnabled),
      })),

      // Sourced directly from the Mission Store — the fleet
      // drone name / target plot label are looked up here (read-only) so
      // the prompt never has to re-resolve bare ids.
      missions: (() => {
        const missionState = useMissionStore.getState();
        const fleetDrones = useFleetStore.getState().drones;
        return missionState.order.map((id) => {
          const mission = missionState.missions[id]!;
          const plot = farmPlots.find((candidate) => candidate.id === mission.targetPlotId);
          const drone = mission.assignedDroneId ? fleetDrones[mission.assignedDroneId] : undefined;
          return {
            id: mission.id,
            name: mission.name,
            missionType: mission.missionType,
            status: mission.status,
            targetPlotLabel: plot?.label ?? null,
            assignedDroneName: drone?.name ?? null,
            progressPercent: mission.progressPercent,
            coverageProgressPercent: mission.coverageProgressPercent,
            estimatedDurationMinutes: mission.estimate?.durationMinutes ?? null,
            estimatedBatteryPercent: mission.estimate?.batteryPercent ?? null,
            estimatedImageCount: mission.estimate?.imageCount ?? null,
            startedAt: mission.startedAt ? formatAlertTimestamp(mission.startedAt) : null,
            completedAt: mission.completedAt ? formatAlertTimestamp(mission.completedAt) : null,
          };
        });
      })(),

      // Sourced directly from the Robot Store — the single
      // source of truth for every ground robot — not from
      // `live-context-store`, which only ever knew about one hardcoded robot.
      // Mirrors `drones` above exactly.
      robots: Object.values(useRobotStore.getState().robots).map((robot) => ({
        id: robot.id,
        name: robot.name,
        robotType: robot.robotType,
        status: robot.status,
        batteryPercent: robot.batteryPercent,
        speedMps: robot.speedMps,
        position: { x: robot.position[0], z: robot.position[1] },
        homePosition: { x: robot.homePosition[0], z: robot.homePosition[1] },
        health: robot.health,
        connectionQuality: robot.connectionQuality,
        signalPercent: robot.signalPercent,
        currentMissionLabel: robot.currentMissionLabel,
        currentMissionTargetLabel: robot.currentMissionTargetPlotId
          ? (farmPlots.find((plot) => plot.id === robot.currentMissionTargetPlotId)?.label ?? robot.currentMissionTargetPlotId)
          : null,
        activityReason: classifyVehicleActivity("robot", robot.id, robot.activeMissionId, robot.status, robotAutonomousEnabled),
      })),

      // Sourced directly from the Robot Mission Store — the
      // assigned robot name / target plot label are looked up here
      // (read-only), mirroring the `missions` block above exactly.
      robotMissions: (() => {
        const robotMissionState = useRobotMissionStore.getState();
        const robots = useRobotStore.getState().robots;
        return robotMissionState.order.map((id) => {
          const mission = robotMissionState.missions[id]!;
          const plot = farmPlots.find((candidate) => candidate.id === mission.targetPlotId);
          const robot = mission.assignedRobotId ? robots[mission.assignedRobotId] : undefined;
          return {
            id: mission.id,
            name: mission.name,
            missionType: mission.missionType,
            status: mission.status,
            targetPlotLabel: plot?.label ?? null,
            assignedRobotName: robot?.name ?? null,
            progressPercent: mission.progressPercent,
            coverageProgressPercent: mission.coverageProgressPercent,
            estimatedDurationMinutes: mission.estimate?.durationMinutes ?? null,
            estimatedBatteryPercent: mission.estimate?.batteryPercent ?? null,
            estimatedDistanceMeters: mission.estimate?.distanceMeters ?? null,
            startedAt: mission.startedAt ? formatAlertTimestamp(mission.startedAt) : null,
            completedAt: mission.completedAt ? formatAlertTimestamp(mission.completedAt) : null,
          };
        });
      })(),

      // Sourced directly from the Sensor Store — the single
      // source of truth for every sensor node — mirrors `drones`/`robots`
      // above exactly. A SEPARATE concept from `sensorNetwork` below (that
      // aggregate is fed by the older static `sensors` array from
      // `intelligence-data.ts`, untouched here).
      sensors: sensorRecords.map((sensor) => {
        // Last-24-hours summary only ("AURA General Context") —
        // a longer/specific range is available on demand via the
        // sensor-trend/sensor-statistics commands' own Time Range Support,
        // not duplicated into every general-chat message.
        const samples = (historicalSamples[sensor.id] ?? []).filter((sample) => sample.timestamp >= Date.now() - HISTORY_SUMMARY_RANGE_MS);
        const trend = samples.length >= 2 ? computeTrendStats(samples) : null;

        return {
          id: sensor.id,
          name: sensor.name,
          sensorType: sensor.sensorType,
          status: sensor.status,
          health: sensor.health,
          batteryPercent: sensor.batteryPercent,
          signalPercent: sensor.signalPercent,
          currentReading: formatSensorReading(sensor),
          position: { x: sensor.position[0], z: sensor.position[1] },
          assignedPlotLabel: sensorPlotLabel(sensor),
          gateway: sensor.gatewayConnected ? sensor.gateway : "Disconnected",
          history: trend
            ? {
                average: Math.round(trend.average * 100) / 100,
                min: trend.min,
                max: trend.max,
                trendDirection: trend.direction,
                rateOfChangePerHour: Math.round(trend.rateOfChange * 100) / 100,
                anomalyDetected: detectAnomalies(samples).length > 0,
                rangeLabel: "Last 24 Hours",
              }
            : null,
        };
      }),

      sensorNetwork: {
        soilMoisturePercent: average(sensors.map((sensor) => sensor.soilMoisturePercent)) ?? null,
        temperatureC: average(sensors.map((sensor) => sensor.temperatureC)) ?? null,
        humidityPercent: average(sensors.map((sensor) => sensor.humidityPercent)),
        // Not modeled anywhere in the app.
        wind: null,
        rain: null,
        ec: null,
        ph: null,
        lightLevel: null,
        // Computed from the real Sensor Store — replaces the
        // old hardcoded `DASHBOARD_SENSOR_NETWORK.nodesOnline`/`.signal`
        // placeholders now that a real per-sensor online/signal count exists.
        nodesOnline: sensorRecords.length > 0 ? `${sensorRecords.filter((sensor) => sensor.status === "online").length}/${sensorRecords.length}` : null,
        signal: (() => {
          const avgSignal = average(sensorRecords.map((sensor) => sensor.signalPercent));
          if (avgSignal === null) return null;
          return avgSignal >= 80 ? "Strong" : avgSignal >= 50 ? "Moderate" : "Weak";
        })(),
        sensorCount: sensors.length,
      },

      weather: (() => {
        const snapshot = weatherState.data;
        const today = snapshot?.forecast[0];
        const tomorrow = snapshot?.forecast[1];
        return {
          preset: live.digitalTwin.weatherPreset,
          locationConfigured: weatherState.locationConfigured === true,
          dataAvailable: snapshot !== null,
          unavailableReason:
            weatherState.locationConfigured === false
              ? "This farm has no real-world location configured, so live weather can't be requested."
              : snapshot
                ? null
                : (weatherState.hydrationError ?? "Weather data hasn't loaded yet."),
          temperatureC: snapshot?.current.temperatureC ?? null,
          apparentTemperatureC: snapshot?.current.apparentTemperatureC ?? null,
          conditionText: snapshot?.current.conditionText ?? null,
          humidityPercent: snapshot?.current.humidityPercent ?? null,
          windKmh: snapshot?.current.windSpeedKmh ?? null,
          windDirectionCompass: snapshot?.current.windDirectionDeg !== undefined && snapshot?.current.windDirectionDeg !== null ? degreesToCompass(snapshot.current.windDirectionDeg) : null,
          rainProbability: today?.precipitationProbabilityPercent !== undefined && today?.precipitationProbabilityPercent !== null ? `${today.precipitationProbabilityPercent}%` : null,
          forecastSummary: today ? `${today.conditionText}, high ${today.tempMaxC ?? "—"}°C / low ${today.tempMinC ?? "—"}°C` : null,
          tomorrowForecastSummary: tomorrow ? `${tomorrow.conditionText}, high ${tomorrow.tempMaxC ?? "—"}°C / low ${tomorrow.tempMinC ?? "—"}°C` : null,
          droneOperatingCondition: snapshot ? snapshot.analysis.droneOperations.level : null,
          droneOperatingReason: snapshot?.analysis.droneOperations.reason ?? null,
          robotOperatingCondition: snapshot ? snapshot.analysis.robotOperations.level : null,
          robotOperatingReason: snapshot?.analysis.robotOperations.reason ?? null,
          irrigationConsideration: snapshot?.analysis.irrigationConsideration.reason ?? null,
          lastUpdated: snapshot?.fetchedAt ?? null,
          dataSource: snapshot?.source ?? null,
          stale: weatherState.stale,
        };
      })(),

      analytics: {
        // No real yield model exists anywhere in this app — honestly
        // `null` (renders as "unavailable" via the `val()` helper in
        // `prompt-builder.ts`) rather than the old fabricated percentage
        // ("show 'Data unavailable' rather than inventing a
        // number").
        yieldPrediction: null,
        cropHealthSummary: buildCropHealthSummary(),
        diseaseRiskSummary: buildDiseaseRiskSummary(),
        waterUsage: buildWaterUsageSummary(),
        energyUsage: buildEnergyUsageSummary(),
        latestSummary: `${buildAnalyticsSummary()} ${buildDiseaseRiskSummary()}.`,
      },

      alerts: buildAlertsSummary(),

      // The Agricultural Reasoning Engine's live recommendation for every
      // real plot ("AURA Reasoning") — computed fresh each send
      // from real sensor/threshold/alert data, never cached/fabricated. See
      // `lib/sensor-analytics/reasoning-engine.ts` for the rule set.
      plotRecommendations: getAllPlotRecommendations().map((recommendation) => ({
        plotId: recommendation.plotId,
        plotLabel: recommendation.plotLabel,
        action: recommendation.action,
        reason: recommendation.reason,
        confidence: recommendation.confidence,
        sourceSensors: recommendation.sourceSensors,
      })),

      // Real drone/robot mission findings (never
      // fabricated; empty if no mission has detected anything yet). Capped
      // at MAX_FINDINGS_IN_CONTEXT most recent, same "don't grow the prompt
      // unboundedly" reason `buildAlertsSummary` above already follows.
      cropFindings: allFindings
        .slice()
        .sort((a, b) => b.detectedAt - a.detectedAt)
        .slice(0, MAX_FINDINGS_IN_CONTEXT)
        .map((finding) => ({
          plotLabel: finding.plotLabel,
          issueType: CROP_ISSUE_TYPE_LABELS[finding.issueType],
          severity: finding.severity,
          status: describeFindingStatus(finding),
          description: finding.description,
          detectedByMissionName: finding.detectedByMissionName,
          detectedAt: formatAlertTimestamp(finding.detectedAt),
          position: { x: finding.position[0], z: finding.position[1] },
          detectionMethod: finding.detectionMethod,
          // `correctiveActionType` (not `resolvedByRobotMissionId`) is the
          // canonical "a robot performed a corrective action" signal — the
          // SAME field `describeFindingStatus()` uses to derive "Action
          // Performed & Resolved" (Part 12: one canonical signal, matching
          // `historical-analytics-service.ts`'s `getRobotEffectiveness`).
          resolvedByRobot: finding.correctiveActionType !== null,
        })),

      // Every real farm plot, with real per-plot finding
      // counts computed from the SAME `allFindings` array above (never a
      // second finding source). Lets AURA answer "which plot has the most
      // active issues"/"which plots need the most attention" from actual
      // counts, not only the sensor-based `plotRecommendations` below.
      plots: plotRecords.map((plot) => {
        const plotFindings = allFindings.filter((finding) => finding.plotId === plot.id);
        return {
          id: plot.id,
          label: plot.label,
          growthStage: plot.growthStage,
          sensorCount: sensorRecords.filter((sensor) => sensor.assignedPlotId === plot.id).length,
          activeFindingCount: plotFindings.filter((finding) => finding.status !== "resolved").length,
          resolvedFindingCount: plotFindings.filter((finding) => finding.status === "resolved").length,
        };
      }),

      // Every recurring schedule, sourced directly from the
      // Recurring Mission Store (the same store `list-recurring-missions`
      // and the Mission Planner's "Recurring" tab read/write). `state`
      // mirrors that deterministic command's own wording exactly.
      recurringMissions: Object.values(useRecurringMissionStore.getState().configs).map((config) => {
        const plot = config.targetPlotId ? farmPlots.find((candidate) => candidate.id === config.targetPlotId) : undefined;
        const missionTypeLabel = config.vehicleKind === "drone"
          ? (config.droneMissionType ? MISSION_TYPE_LABELS[config.droneMissionType] : null)
          : (config.robotMissionType ? ROBOT_MISSION_TYPE_LABELS[config.robotMissionType] : null);
        const assignedVehicleName =
          config.vehicleKind === "drone"
            ? (config.assignedDroneId ? (useFleetStore.getState().drones[config.assignedDroneId]?.name ?? null) : null)
            : (config.assignedRobotId ? (useRobotStore.getState().robots[config.assignedRobotId]?.name ?? null) : null);
        return {
          id: config.id,
          name: config.name,
          vehicleKind: config.vehicleKind,
          missionTypeLabel,
          assignedVehicleName,
          targetPlotLabel: plot?.label ?? null,
          intervalMinutes: config.intervalMinutes,
          enabled: config.enabled,
          state: config.enabled ? (config.activeRunId ? "running now" : "scheduled") : "disabled",
          nextRunAt: config.nextRunAt ? new Date(config.nextRunAt).toISOString() : null,
        };
      }),

      // The global toggles — the exact same source
      // `show-autonomous-status` reports from.
      autonomous: {
        droneEnabled: droneAutonomousEnabled,
        robotEnabled: robotAutonomousEnabled,
      },

      // The canonical robot capability map, listing
      // EVERY issue type (never only the resolvable ones) so AURA can
      // directly answer "which issues cannot currently be resolved by
      // robots?" without inferring absence from a shorter list.
      robotCapabilities: CROP_ISSUE_TYPES.map((issueType) => {
        const capability = ROBOT_ISSUE_CAPABILITIES[issueType];
        return {
          issueType,
          issueTypeLabel: CROP_ISSUE_TYPE_LABELS[issueType],
          robotResolvable: capability !== undefined,
          actionType: capability?.actionType ?? null,
        };
      }),
    };
  };
}
