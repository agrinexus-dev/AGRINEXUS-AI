import { getPlotById, usePlotStore } from "@/lib/plots/plot-store";
import { useSensorStore } from "@/lib/sensors/sensor-store";

import { useAlertStore } from "./alert-store";
import { evaluatePlotCondition, rankRecommendations, type PlotRecommendation, type ReasoningAlertInput, type ReasoningSensorReading } from "./reasoning-engine";
import { useThresholdStore } from "./threshold-store";
import { useHistoricalStore } from "./historical-store";
import { computeTrendStats } from "./trend-analysis";
import type { MissionSensorJustification, PlotSensorAnalyticsSnapshot } from "./types";

/**
 * The Sensor → Mission integration layer ("Sensor → Mission
 * Linkage" + "Agricultural Reasoning Engine"). This is the ONE place that
 * reads the Sensor/Threshold/Alert/Historical Stores and turns them into
 * something a Mission Planner or AURA can act on — neither Mission Store
 * duplicates any of this; they only ever receive the resulting plain
 * snapshot (`getPlotSensorAnalyticsSnapshot`) or justification record
 * (`buildMissionSensorJustification`) at mission-creation time.
 */
export function getPlotSensorAnalyticsSnapshot(plotId: string): PlotSensorAnalyticsSnapshot {
  const sensors = Object.values(useSensorStore.getState().sensors).filter((sensor) => sensor.assignedPlotId === plotId);

  const soilMoistureReadings = sensors.filter((sensor) => sensor.sensorType === "soil-moisture").map((sensor) => sensor.currentReading);
  const temperatureReadings = sensors
    .filter((sensor) => sensor.sensorType === "soil-temperature" || sensor.sensorType === "air-temperature")
    .map((sensor) => sensor.currentReading);

  return {
    plotId,
    averageSoilMoisture: soilMoistureReadings.length ? soilMoistureReadings.reduce((sum, value) => sum + value, 0) / soilMoistureReadings.length : null,
    averageTemperature: temperatureReadings.length ? temperatureReadings.reduce((sum, value) => sum + value, 0) / temperatureReadings.length : null,
    criticalSensorCount: sensors.filter((sensor) => sensor.status === "critical").length,
    lastUpdatedAt: Date.now(),
  };
}

/**
 * Assembles the Agricultural Reasoning Engine's `PlotReasoningInput` for one
 * plot from live store state — the "wired" half of the reasoning pipeline
 * (see `reasoning-engine.ts`'s own doc comment for why this stays a
 * separate, non-pure function). A snapshot read via `.getState()`, exactly
 * like `getPlotSensorAnalyticsSnapshot` above — never a subscription, since
 * this is called on demand (an AURA command, a mission-creation request),
 * not from a render.
 */
function buildReasoningInputForPlot(plotId: string, plotLabel: string) {
  const allSensors = Object.values(useSensorStore.getState().sensors);
  const plotSensors = allSensors.filter((sensor) => sensor.assignedPlotId === plotId);

  const soilMoistureReadings: ReasoningSensorReading[] = plotSensors
    .filter((sensor) => sensor.sensorType === "soil-moisture")
    .map((sensor) => ({ sensorId: sensor.id, sensorName: sensor.name, currentReading: sensor.currentReading }));

  const temperatureReadings: ReasoningSensorReading[] = plotSensors
    .filter((sensor) => sensor.sensorType === "soil-temperature" || sensor.sensorType === "air-temperature")
    .map((sensor) => ({ sensorId: sensor.id, sensorName: sensor.name, currentReading: sensor.currentReading }));

  const plotSensorIds = new Set(plotSensors.map((sensor) => sensor.id));
  const activeAlerts: ReasoningAlertInput[] = Object.values(useAlertStore.getState().alerts)
    .filter((alert) => alert.resolvedAt === null && alert.sensorId !== null && plotSensorIds.has(alert.sensorId))
    .map((alert) => ({ alertType: alert.alertType, severity: alert.severity, sensorName: alert.sensorName }));

  const unhealthySensorCount = plotSensors.filter((sensor) => sensor.status === "critical" || sensor.status === "offline").length;

  const primaryMoistureSensor = plotSensors.find((sensor) => sensor.sensorType === "soil-moisture");
  const moistureSamples = primaryMoistureSensor ? (useHistoricalStore.getState().samples[primaryMoistureSensor.id] ?? []) : [];
  const soilMoistureTrend = moistureSamples.length >= 2 ? computeTrendStats(moistureSamples).direction : null;

  const { thresholds } = useThresholdStore.getState();

  return {
    plotId,
    plotLabel,
    soilMoistureReadings,
    temperatureReadings,
    soilMoistureThreshold: thresholds["soil-moisture"],
    temperatureThreshold: thresholds.temperature,
    activeAlerts,
    unhealthySensorCount,
    soilMoistureTrend,
  };
}

/**
 * Runs the Agricultural Reasoning Engine for one plot against its current
 * real data. Never fabricates a reading — see `evaluatePlotCondition`'s own
 * doc comment for the exact rule set and the explicit "unavailable"
 * fallback. Plot label now resolved via the Plot Store —
 * `getPlotById` reads the same `farmPlots`-seeded data `farmPlots.find`
 * always returned here, PLUS whatever the backend hydration has merged in;
 * behavior is unchanged for the 4 demo plots, and this is now the
 * "genuinely backend-aware" plot lookup both AURA's plot reasoning and the
 * Digital Twin Details Panel go through.
 */
export function getPlotRecommendation(plotId: string): PlotRecommendation {
  const plot = getPlotById(plotId);
  const plotLabel = plot?.label ?? plotId;
  return evaluatePlotCondition(buildReasoningInputForPlot(plotId, plotLabel));
}

/**
 * Runs the Agricultural Reasoning Engine across every real farm plot, ranked
 * worst-first (irrigate > inspect > monitor > unavailable) — the data source
 * for AURA's "Which fields are getting dry?" / "Which fields need
 * inspection?" commands, and (as of the AURA permission fix)
 * "Which fields need irrigation/inspection?"/"Show unhealthy crops" once
 * those became reachable. Enumerates plot ids via the real Plot Store
 * (`usePlotStore.getState()`, the same non-reactive snapshot read
 * `getPlotById` already uses below) rather than the static `farmPlots`
 * array this used to read directly — `getPlotRecommendation` itself was
 * already Plot-Store-backed; only the "which plot ids
 * exist" enumeration here hadn't been switched over. No behavior change for
 * the current single demo farm (identical data either way), but this now
 * genuinely reflects live/farm-scoped plot data going forward.
 */
export function getAllPlotRecommendations(): PlotRecommendation[] {
  const plots = Object.values(usePlotStore.getState().plots);
  return rankRecommendations(plots.map((plot) => getPlotRecommendation(plot.id)));
}

/**
 * Builds the embeddable "why was this mission created?" record for a
 * sensor-driven mission ("Sensor → Mission Linkage") — returns
 * `null` (never a fabricated justification) unless the reasoning engine's
 * CURRENT recommendation for this plot is actually "irrigate" or "inspect".
 * The only writer of `MissionRecord.sensorJustification`/
 * `RobotMissionRecord.sensorJustification` — see `action-executor.ts`'s
 * `create-sensor-mission` handler, the only caller.
 */
export function buildMissionSensorJustification(plotId: string): MissionSensorJustification | null {
  const recommendation = getPlotRecommendation(plotId);
  if (recommendation.action !== "irrigate" && recommendation.action !== "inspect") return null;

  const plotSensors = Object.values(useSensorStore.getState().sensors).filter((sensor) => sensor.assignedPlotId === plotId);
  const sourceSensorIds = recommendation.sourceSensors
    .map((name) => plotSensors.find((sensor) => sensor.name === name)?.id)
    .filter((id): id is string => Boolean(id));

  return {
    plotId: recommendation.plotId,
    plotLabel: recommendation.plotLabel,
    action: recommendation.action,
    reason: recommendation.reason,
    confidence: recommendation.confidence ?? "moderate",
    sourceSensorIds,
    sourceSensorNames: recommendation.sourceSensors,
    createdAt: Date.now(),
  };
}
