import { MISSION_STATUS_LABELS, type MissionStatus } from "@/lib/missions/types";
import { ROBOT_MISSION_STATUS_LABELS, type RobotMissionStatus } from "@/lib/robot-missions/types";
import { useHistoricalStore } from "@/lib/sensor-analytics/historical-store";
import { getAllPlotRecommendations } from "@/lib/sensor-analytics/mission-integration";
import { computeSensorHealthScore, detectAnomalies } from "@/lib/sensor-analytics/trend-analysis";
import { useSensorStore } from "@/lib/sensors/sensor-store";
import { SENSOR_TYPE_LABELS } from "@/lib/sensors/types";

import type { FarmSummaryFacts, MissionReportFacts, SensorReportFacts } from "./reports-service";

export type ReportKind = "farm-summary" | "mission-report" | "sensor-report" | "analytics-report";

export interface ReportPreview {
  kind: ReportKind;
  title: string;
  generatedAt: number;
  lines: string[];
}

/**
 * Report generation (backend-connected in 018F Part 9) —
 * there is still no real PDF/file engine anywhere in this app, so this
 * deliberately does NOT claim to produce a downloadable file. It builds a
 * real, live-data text preview instead.
 *
 * The count/status/timestamp facts (plot count, sensor count, active
 * alerts, mission counts by status, recent missions) now come from
 * `GET /api/reports` — real Postgres queries via `reports-service.ts`, not
 * a `.getState()` read that silently depended on some OTHER page having
 * already hydrated these Zustand stores first. The plot-recommendation /
 * sensor-anomaly lines still come from the SAME client functions every
 * other page reads (`getAllPlotRecommendations`, `computeSensorHealthScore`,
 * `detectAnomalies`) — see `reports-service.ts`'s doc comment for exactly
 * why those stay client-side (the Agricultural Reasoning Engine has no
 * backend model to read from yet). `ReportsPage` labels this clearly as a
 * preview and marks actual export as unavailable — see that file's own doc
 * comment.
 */
export async function buildReportPreview(kind: ReportKind): Promise<ReportPreview> {
  const generatedAt = Date.now();

  const response = await fetch(`/api/reports?kind=${kind}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Could not load report data (${response.status}).`);
  }
  const { facts } = (await response.json()) as { facts: unknown };

  switch (kind) {
    case "farm-summary":
      return { kind, title: "Farm Summary Report", generatedAt, lines: buildFarmSummaryLines(facts as FarmSummaryFacts) };
    case "mission-report":
      return { kind, title: "Mission Report", generatedAt, lines: buildMissionReportLines(facts as MissionReportFacts) };
    case "sensor-report":
      return { kind, title: "Sensor Report", generatedAt, lines: buildSensorReportLines(facts as SensorReportFacts) };
    case "analytics-report":
      return { kind, title: "Analytics Report", generatedAt, lines: buildAnalyticsReportLines() };
  }
}

function buildFarmSummaryLines(facts: FarmSummaryFacts): string[] {
  const recommendations = getAllPlotRecommendations();

  return [
    `${facts.plotLabels.length} plots tracked: ${facts.plotLabels.join(", ")}.`,
    `${facts.sensorCount} sensors registered across the farm.`,
    `${facts.activeAlertCount} active alert${facts.activeAlertCount === 1 ? "" : "s"}.`,
    `${facts.droneMissionCount} drone mission${facts.droneMissionCount === 1 ? "" : "s"}, ${facts.robotMissionCount} robot mission${facts.robotMissionCount === 1 ? "" : "s"} on record.`,
    "",
    "Plot status:",
    ...recommendations.map((rec) => `  ${rec.plotLabel}: ${rec.action} — ${rec.reason}`),
  ];
}

function buildMissionReportLines(facts: MissionReportFacts): string[] {
  const droneTotal = Object.values(facts.droneMissionsByStatus).reduce((sum, count) => sum + count, 0);
  const robotTotal = Object.values(facts.robotMissionsByStatus).reduce((sum, count) => sum + count, 0);

  const recentLines = facts.recentMissions.map((entry) => `  ${entry.name} (${entry.typeLabel}) — ${new Date(entry.createdAt).toLocaleString()}`);

  return [
    `${droneTotal} drone missions on record:`,
    ...Object.entries(facts.droneMissionsByStatus).map(([status, count]) => `  ${MISSION_STATUS_LABELS[status as MissionStatus] ?? status}: ${count}`),
    "",
    `${robotTotal} robot missions on record:`,
    ...Object.entries(facts.robotMissionsByStatus).map(([status, count]) => `  ${ROBOT_MISSION_STATUS_LABELS[status as RobotMissionStatus] ?? status}: ${count}`),
    "",
    `${facts.droneMissionSensorTriggeredCount + facts.robotMissionSensorTriggeredCount} mission(s) were created from a sensor-driven recommendation (${facts.droneMissionSensorTriggeredCount} drone, ${facts.robotMissionSensorTriggeredCount} robot).`,
    "",
    "Recent missions:",
    ...recentLines,
  ];
}

function buildSensorReportLines(facts: SensorReportFacts): string[] {
  const sensors = Object.values(useSensorStore.getState().sensors);
  const samplesBySensorId = useHistoricalStore.getState().samples;

  const scored = sensors.map((sensor) => ({
    sensor,
    score: computeSensorHealthScore(sensor, detectAnomalies(samplesBySensorId[sensor.id] ?? []).length),
  }));
  const weakest = scored.slice().sort((a, b) => a.score - b.score).slice(0, 5);

  return [
    `${facts.totalCount} sensors registered:`,
    ...Object.entries(facts.countByType).map(([type, count]) => `  ${SENSOR_TYPE_LABELS[type as keyof typeof SENSOR_TYPE_LABELS] ?? type}: ${count}`),
    "",
    `${facts.offlineCount} sensor(s) currently offline.`,
    "",
    "Lowest health-score sensors:",
    ...(weakest.length > 0
      ? weakest.map(({ sensor, score }) => `  ${sensor.name}: ${score}/100`)
      : ["  Not available yet — open the Sensor Network or Sensor Analytics Center first so this session has live sensor data to score."]),
  ];
}

function buildAnalyticsReportLines(): string[] {
  const recommendations = getAllPlotRecommendations();
  const sensors = Object.values(useSensorStore.getState().sensors);
  const samplesBySensorId = useHistoricalStore.getState().samples;
  const totalAnomalies = sensors.reduce((sum, sensor) => sum + detectAnomalies(samplesBySensorId[sensor.id] ?? []).length, 0);
  const irrigate = recommendations.filter((rec) => rec.action === "irrigate").length;
  const inspect = recommendations.filter((rec) => rec.action === "inspect").length;
  const normal = recommendations.filter((rec) => rec.action === "monitor").length;

  return [
    `${irrigate} plot(s) recommended for irrigation, ${inspect} for inspection, ${normal} reporting normal conditions.`,
    `${totalAnomalies} sensor anomal${totalAnomalies === 1 ? "y" : "ies"} detected across the farm.`,
    "Yield/production metrics: Data unavailable — no yield model exists in this application yet.",
  ];
}
