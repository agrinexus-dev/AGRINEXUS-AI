import "server-only";

import { prisma } from "@/lib/prisma/client";
import { listPlots } from "@/lib/plots/plots-service";
import { MISSION_TYPE_LABELS, type MissionType } from "@/lib/missions/types";
import { ROBOT_MISSION_TYPE_LABELS, type RobotMissionType } from "@/lib/robot-missions/types";

/**
 * Server-only Reports data access — mirrors
 * `analytics-service.ts`'s exact shape: the ONLY module that runs the
 * aggregate/list queries Reports needs. Every function takes `farmId`
 * explicitly, every caller derives it from the authenticated session.
 *
 * Covers exactly the facts each report kind can derive HONESTLY from
 * persisted Postgres rows — plot list, sensor counts, alert counts, mission
 * counts/status breakdown, and real mission timestamps. It deliberately
 * does NOT attempt to reproduce the Agricultural Reasoning Engine's plot
 * recommendations (`getAllPlotRecommendations` in
 * `sensor-analytics/mission-integration.ts`) server-side: that engine reads
 * live current sensor readings PLUS the Threshold Store, which has no
 * backend model at all (confirmed in schema.prisma's own top-of-file
 * scope note) — reimplementing it here would mean either fabricating a
 * second, server-side reasoning engine (a real "two competing
 * implementations" risk Part 8 explicitly warns against) or silently
 * expanding this prompt's scope to include a Threshold backend it never
 * asked for. Per Part 24's own instruction, that's a discovered
 * prerequisite this prompt does NOT invent a workaround for — see the
 * final report's "Remaining Reports work" section. `build-report.ts`
 * combines these real backend facts with that same client-side reasoning
 * output exactly as before, now guaranteed fresh via each page's mount
 * hydration effects rather than relying on some other page having visited
 * first.
 */

export interface FarmSummaryFacts {
  plotLabels: string[];
  sensorCount: number;
  activeAlertCount: number;
  droneMissionCount: number;
  robotMissionCount: number;
}

export async function getFarmSummaryFacts(farmId: string): Promise<FarmSummaryFacts> {
  const [plots, sensorCount, activeAlertCount, droneMissionCount, robotMissionCount] = await Promise.all([
    listPlots(farmId),
    prisma.sensor.count({ where: { farmId } }),
    prisma.alert.count({ where: { farmId, resolvedAt: null } }),
    prisma.droneMission.count({ where: { farmId } }),
    prisma.robotMission.count({ where: { farmId } }),
  ]);
  return {
    plotLabels: plots.map((plot) => plot.label),
    sensorCount,
    activeAlertCount,
    droneMissionCount,
    robotMissionCount,
  };
}

export interface RecentMissionFact {
  name: string;
  typeLabel: string;
  createdAt: number;
}

export interface MissionReportFacts {
  droneMissionsByStatus: Record<string, number>;
  robotMissionsByStatus: Record<string, number>;
  droneMissionSensorTriggeredCount: number;
  robotMissionSensorTriggeredCount: number;
  recentMissions: RecentMissionFact[];
}

const RECENT_LIMIT = 8;

export async function getMissionReportFacts(farmId: string): Promise<MissionReportFacts> {
  const [droneByStatus, robotByStatus, droneJustifications, robotJustifications, recentDrone, recentRobot] = await Promise.all([
    prisma.droneMission.groupBy({ by: ["status"], where: { farmId }, _count: { _all: true } }),
    prisma.robotMission.groupBy({ by: ["status"], where: { farmId }, _count: { _all: true } }),
    // Selecting only the one JSON column, farm-scoped — small, bounded
    // payload (never the full mission rows) to count sensor-triggered
    // missions in JS rather than fighting Prisma's nullable-Json "is not
    // null" filter syntax for a value this cheap to check directly.
    prisma.droneMission.findMany({ where: { farmId }, select: { sensorJustification: true } }),
    prisma.robotMission.findMany({ where: { farmId }, select: { sensorJustification: true } }),
    prisma.droneMission.findMany({ where: { farmId }, orderBy: { createdAt: "desc" }, take: RECENT_LIMIT, select: { name: true, missionType: true, createdAt: true } }),
    prisma.robotMission.findMany({ where: { farmId }, orderBy: { createdAt: "desc" }, take: RECENT_LIMIT, select: { name: true, missionType: true, createdAt: true } }),
  ]);

  const droneMissionsByStatus = Object.fromEntries(droneByStatus.map((row) => [row.status.replaceAll("_", "-"), row._count._all]));
  const robotMissionsByStatus = Object.fromEntries(robotByStatus.map((row) => [row.status, row._count._all]));

  const recentMissions: RecentMissionFact[] = [
    ...recentDrone.map((row) => ({ name: row.name, typeLabel: MISSION_TYPE_LABELS[row.missionType.replaceAll("_", "-") as MissionType], createdAt: row.createdAt.getTime() })),
    ...recentRobot.map((row) => ({ name: row.name, typeLabel: ROBOT_MISSION_TYPE_LABELS[row.missionType.replaceAll("_", "-") as RobotMissionType], createdAt: row.createdAt.getTime() })),
  ]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, RECENT_LIMIT);

  return {
    droneMissionsByStatus,
    robotMissionsByStatus,
    droneMissionSensorTriggeredCount: droneJustifications.filter((row) => row.sensorJustification !== null).length,
    robotMissionSensorTriggeredCount: robotJustifications.filter((row) => row.sensorJustification !== null).length,
    recentMissions,
  };
}

export interface SensorReportFacts {
  countByType: Record<string, number>;
  offlineCount: number;
  totalCount: number;
}

export async function getSensorReportFacts(farmId: string): Promise<SensorReportFacts> {
  const [byType, offlineCount, totalCount] = await Promise.all([
    prisma.sensor.groupBy({ by: ["sensorType"], where: { farmId }, _count: { _all: true } }),
    prisma.sensor.count({ where: { farmId, status: "offline" } }),
    prisma.sensor.count({ where: { farmId } }),
  ]);
  return {
    countByType: Object.fromEntries(byType.map((row) => [row.sensorType.replaceAll("_", "-"), row._count._all])),
    offlineCount,
    totalCount,
  };
}
