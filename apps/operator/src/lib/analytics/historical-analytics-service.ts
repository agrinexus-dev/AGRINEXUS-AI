import "server-only";

import { prisma } from "@/lib/prisma/client";

import { CROP_ISSUE_SEVERITIES, CROP_ISSUE_TYPES, type CropIssueSeverity, type CropIssueType } from "@/lib/findings/types";

/**
 * Server-only HISTORICAL Analytics data access — a
 * companion to `analytics-service.ts`'s point-in-time `FarmAnalyticsSnapshot`
 * (that file stays untouched; this is additive, not a replacement). Every
 * number here is derived from REAL persisted timestamps
 * (`CropFinding.detectedAt`/`resolvedAt`, `DroneMission`/`RobotMission`
 * `createdAt`/`startedAt`/`completedAt`) — nothing is fabricated, and every
 * field that can't be honestly computed from what's actually in the
 * database is `null`/an empty array rather than a guessed value. Every
 * function takes `farmId` explicitly; every caller derives it from the
 * authenticated session (`getFarmForSession`), never from client input —
 * same farm-scoping discipline as every other `*-service.ts` in this repo.
 *
 * Two honesty notes established during an audit, both
 * reflected directly in this file's shape:
 *  - The schema records NO "failed" mission status for either
 *  `DroneMission` or `RobotMission` — only `cancelled` is a terminal
 *  non-completion state. There is therefore no `failed` field anywhere
 *  below; a UI asking for "failed missions" must be told this data
 *  doesn't exist, not shown a fabricated zero.
 *  - There is no server-side per-reading sensor time-series table (`Sensor`
 *  only keeps a 24-entry `readingHistory` JSON sparkline plus whatever the
 *  entirely client-side Historical Store has accumulated this session) —
 *  so sensor "history" here is limited to current status/reading
 *  snapshots per plot, never a fabricated trend line.
 */

// ---------------------------------------------------------------------------
// Findings over time
// ---------------------------------------------------------------------------

export interface FindingsDailyPoint {
  /** UTC calendar day, e.g. "2026-08-20". */
  dateKey: string;
  detected: number;
  resolved: number;
}

export interface FindingsHistory {
  /** `false` when this farm has zero persisted findings — the UI must render the honest "Not enough historical data yet." empty state, never a fabricated flat/empty chart. */
  hasData: boolean;
  earliestDetectedAt: number | null;
  latestDetectedAt: number | null;
  /** One entry per real UTC calendar day from the earliest finding to today — never a fake historical point beyond what `earliestDetectedAt` actually covers. Empty when `hasData` is false. */
  daily: FindingsDailyPoint[];
  totalDetected: number;
  totalResolved: number;
  totalUnresolved: number;
  totalRequiresHumanAction: number;
  /** `resolved / totalDetected`, rounded — `null` when there are zero findings (never fabricated as 0%). */
  resolutionRatePercent: number | null;
  bySeverity: Record<CropIssueSeverity, number>;
  byIssueType: Record<CropIssueType, number>;
  byPlot: { plotId: string; plotLabel: string; total: number; unresolved: number }[];
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Builds every real UTC calendar day between `from` and `to` inclusive — the honest set of buckets a chart is allowed to show. */
function enumerateDays(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor.getTime() <= end.getTime()) {
    days.push(utcDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function zeroSeverity(): Record<CropIssueSeverity, number> {
  return Object.fromEntries(CROP_ISSUE_SEVERITIES.map((s) => [s, 0])) as Record<CropIssueSeverity, number>;
}
function zeroIssueType(): Record<CropIssueType, number> {
  return Object.fromEntries(CROP_ISSUE_TYPES.map((t) => [t, 0])) as Record<CropIssueType, number>;
}

/** Findings fetch capped the same way `findings-service.ts`'s `listFindings` is (`LIST_LIMIT = 500`) — avoids loading an unbounded table; a farm with more history than this would need real pagination, which no page currently asks for. */
const FINDINGS_HISTORY_LIMIT = 1000;

export async function getFindingsHistory(farmId: string): Promise<FindingsHistory> {
  const rows = await prisma.cropFinding.findMany({
    where: { farmId },
    select: {
      plotId: true,
      plot: { select: { label: true } },
      issueType: true,
      severity: true,
      status: true,
      detectedAt: true,
      resolvedAt: true,
    },
    orderBy: { detectedAt: "asc" },
    take: FINDINGS_HISTORY_LIMIT,
  });

  if (rows.length === 0) {
    return {
      hasData: false,
      earliestDetectedAt: null,
      latestDetectedAt: null,
      daily: [],
      totalDetected: 0,
      totalResolved: 0,
      totalUnresolved: 0,
      totalRequiresHumanAction: 0,
      resolutionRatePercent: null,
      bySeverity: zeroSeverity(),
      byIssueType: zeroIssueType(),
      byPlot: [],
    };
  }

  const earliest = rows[0]!.detectedAt;
  const latest = rows.reduce((max, row) => (row.detectedAt > max ? row.detectedAt : max), rows[0]!.detectedAt);

  const dailyMap = new Map<string, FindingsDailyPoint>();
  for (const key of enumerateDays(earliest, new Date())) {
    dailyMap.set(key, { dateKey: key, detected: 0, resolved: 0 });
  }

  const bySeverity = zeroSeverity();
  const byIssueType = zeroIssueType();
  const byPlotMap = new Map<string, { plotId: string; plotLabel: string; total: number; unresolved: number }>();

  let totalResolved = 0;
  let totalUnresolved = 0;
  let totalRequiresHumanAction = 0;

  for (const row of rows) {
    const detectedKey = utcDateKey(row.detectedAt);
    const detectedBucket = dailyMap.get(detectedKey);
    if (detectedBucket) detectedBucket.detected += 1;

    if (row.resolvedAt) {
      const resolvedKey = utcDateKey(row.resolvedAt);
      const resolvedBucket = dailyMap.get(resolvedKey);
      // A finding resolved "today" (after the daily map was built from
      // `earliest`..`now`) always has a bucket — `resolvedAt` can never
      // precede `detectedAt`, and `detectedAt` already anchors the range.
      if (resolvedBucket) resolvedBucket.resolved += 1;
      totalResolved += 1;
    } else if (row.status === "requires_human_action") {
      totalRequiresHumanAction += 1;
      totalUnresolved += 1;
    } else {
      totalUnresolved += 1;
    }

    const severity = row.severity as CropIssueSeverity;
    bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;

    const issueType = row.issueType.replaceAll("_", "-") as CropIssueType;
    byIssueType[issueType] = (byIssueType[issueType] ?? 0) + 1;

    const plotEntry = byPlotMap.get(row.plotId) ?? { plotId: row.plotId, plotLabel: row.plot.label, total: 0, unresolved: 0 };
    plotEntry.total += 1;
    if (!row.resolvedAt) plotEntry.unresolved += 1;
    byPlotMap.set(row.plotId, plotEntry);
  }

  const totalDetected = rows.length;

  return {
    hasData: true,
    earliestDetectedAt: earliest.getTime(),
    latestDetectedAt: latest.getTime(),
    daily: Array.from(dailyMap.values()),
    totalDetected,
    totalResolved,
    totalUnresolved,
    totalRequiresHumanAction,
    resolutionRatePercent: totalDetected > 0 ? Math.round((totalResolved / totalDetected) * 100) : null,
    bySeverity,
    byIssueType,
    byPlot: Array.from(byPlotMap.values()).sort((a, b) => b.total - a.total),
  };
}

// ---------------------------------------------------------------------------
// Mission activity
// ---------------------------------------------------------------------------

export interface MissionActivityHistory {
  hasData: boolean;
  drone: {
    total: number;
    completed: number;
    cancelled: number;
    recurringRuns: number;
    byPlot: { plotId: string; plotLabel: string; total: number }[];
  };
  robot: {
    total: number;
    completed: number;
    cancelled: number;
    recurringRuns: number;
    byPlot: { plotId: string; plotLabel: string; total: number }[];
  };
  /** No "failed" status exists in the schema for either mission type (Part 1's audit finding) — deliberately absent here rather than fabricated. */
}

export async function getMissionActivityHistory(farmId: string): Promise<MissionActivityHistory> {
  const [droneMissions, robotMissions] = await Promise.all([
    prisma.droneMission.findMany({
      where: { farmId },
      select: { status: true, targetPlotId: true, targetPlot: { select: { label: true } }, recurringConfigId: true },
    }),
    prisma.robotMission.findMany({
      where: { farmId },
      select: { status: true, targetPlotId: true, targetPlot: { select: { label: true } }, recurringConfigId: true },
    }),
  ]);

  function summarize(missions: { status: string; targetPlotId: string | null; targetPlot: { label: string } | null; recurringConfigId: string | null }[]) {
    const byPlotMap = new Map<string, { plotId: string; plotLabel: string; total: number }>();
    let completed = 0;
    let cancelled = 0;
    let recurringRuns = 0;
    for (const mission of missions) {
      if (mission.status === "completed") completed += 1;
      if (mission.status === "cancelled") cancelled += 1;
      if (mission.recurringConfigId) recurringRuns += 1;
      if (mission.targetPlotId && mission.targetPlot) {
        const entry = byPlotMap.get(mission.targetPlotId) ?? { plotId: mission.targetPlotId, plotLabel: mission.targetPlot.label, total: 0 };
        entry.total += 1;
        byPlotMap.set(mission.targetPlotId, entry);
      }
    }
    return {
      total: missions.length,
      completed,
      cancelled,
      recurringRuns,
      byPlot: Array.from(byPlotMap.values()).sort((a, b) => b.total - a.total),
    };
  }

  const drone = summarize(droneMissions);
  const robot = summarize(robotMissions);

  return { hasData: drone.total > 0 || robot.total > 0, drone, robot };
}

// ---------------------------------------------------------------------------
// Robot effectiveness
// ---------------------------------------------------------------------------

export interface RobotEffectiveness {
  hasData: boolean;
  issuesDetectedByRobots: number;
  issuesResolvedByRobots: number;
  /** `resolvedByRobots / totalFindings` across ALL findings on the farm (a robot can resolve a finding a drone detected) — `null` when there are zero findings at all. */
  resolutionRatePercent: number | null;
  /** Issue types actually resolved by a robot, with counts — never lists a type with zero resolutions. */
  issueTypesResolved: { issueType: CropIssueType; count: number }[];
  /** Distinct corrective-action labels actually recorded, with counts — the real robot actions used, straight from `correctiveActionType`. */
  actionsUsed: { actionType: string; count: number }[];
  /** Average minutes between `detectedAt` and `resolvedAt` for findings a robot resolved — `null` unless at least one such finding has both real timestamps (which it always will once resolved, but this stays defensive rather than assuming). */
  averageDetectionToResolutionMinutes: number | null;
}

export async function getRobotEffectiveness(farmId: string): Promise<RobotEffectiveness> {
  // "A robot actually performed a corrective action" is signaled by
  // `correctiveActionType` being set — the SAME canonical field
  // `describeFindingStatus()` (lib/findings/types.ts) uses to derive
  // "Action Performed & Resolved" (Part 12: one canonical signal, never a
  // second competing one). NOT `resolvedByRobotMissionId`: live verification
  // found real seeded findings with `correctiveActionType`
  // set but `resolvedByRobotMissionId` null (predating this change),
  // which would silently under-count real robot resolutions if used here.
  const [totalFindings, detectedByRobots, resolvedRows] = await Promise.all([
    prisma.cropFinding.count({ where: { farmId } }),
    prisma.cropFinding.count({ where: { farmId, detectionMethod: "robot" } }),
    prisma.cropFinding.findMany({
      where: { farmId, correctiveActionType: { not: null } },
      select: { issueType: true, correctiveActionType: true, detectedAt: true, resolvedAt: true },
    }),
  ]);

  const issueTypeCounts = new Map<CropIssueType, number>();
  const actionCounts = new Map<string, number>();
  let totalResolutionMs = 0;
  let resolutionSamples = 0;

  for (const row of resolvedRows) {
    const issueType = row.issueType.replaceAll("_", "-") as CropIssueType;
    issueTypeCounts.set(issueType, (issueTypeCounts.get(issueType) ?? 0) + 1);

    if (row.correctiveActionType) {
      actionCounts.set(row.correctiveActionType, (actionCounts.get(row.correctiveActionType) ?? 0) + 1);
    }

    if (row.resolvedAt) {
      totalResolutionMs += row.resolvedAt.getTime() - row.detectedAt.getTime();
      resolutionSamples += 1;
    }
  }

  return {
    hasData: totalFindings > 0,
    issuesDetectedByRobots: detectedByRobots,
    issuesResolvedByRobots: resolvedRows.length,
    resolutionRatePercent: totalFindings > 0 ? Math.round((resolvedRows.length / totalFindings) * 100) : null,
    issueTypesResolved: Array.from(issueTypeCounts.entries()).map(([issueType, count]) => ({ issueType, count })),
    actionsUsed: Array.from(actionCounts.entries()).map(([actionType, count]) => ({ actionType, count })),
    averageDetectionToResolutionMinutes: resolutionSamples > 0 ? Math.round(totalResolutionMs / resolutionSamples / 60000) : null,
  };
}

// ---------------------------------------------------------------------------
// Plot health overview
// ---------------------------------------------------------------------------

export interface PlotRecentFinding {
  id: string;
  issueType: CropIssueType;
  severity: CropIssueSeverity;
  status: "detected" | "resolved" | "requires-human-action";
  detectedAt: number;
  resolvedAt: number | null;
}

export interface PlotHealthOverview {
  plotId: string;
  plotLabel: string;
  activeFindings: number;
  resolvedFindings: number;
  severityBreakdown: Record<CropIssueSeverity, number>;
  /** Most recent 5 findings for this plot, newest first — real records only. */
  recentFindings: PlotRecentFinding[];
  droneMissionCount: number;
  robotMissionCount: number;
  lastMissionAt: number | null;
  sensors: { total: number; online: number; warning: number; critical: number; offline: number };
  /** Findings on this plot a robot actually resolved — the "robot intervention" figure Part 2D asks for. */
  robotInterventions: number;
}

const RECENT_FINDINGS_PER_PLOT = 5;

export async function getPlotHealthOverviews(farmId: string): Promise<PlotHealthOverview[]> {
  const plots = await prisma.plot.findMany({ where: { farmId }, select: { id: true, label: true }, orderBy: { label: "asc" } });
  if (plots.length === 0) return [];

  const plotIds = plots.map((p) => p.id);

  const [findings, droneMissionsByPlot, robotMissionsByPlot, sensorsByPlot] = await Promise.all([
    prisma.cropFinding.findMany({
      where: { farmId, plotId: { in: plotIds } },
      select: { id: true, plotId: true, issueType: true, severity: true, status: true, detectedAt: true, resolvedAt: true, correctiveActionType: true },
      orderBy: { detectedAt: "desc" },
    }),
    prisma.droneMission.groupBy({ by: ["targetPlotId"], where: { farmId, targetPlotId: { in: plotIds } }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.robotMission.groupBy({ by: ["targetPlotId"], where: { farmId, targetPlotId: { in: plotIds } }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.sensor.findMany({ where: { farmId, assignedPlotId: { in: plotIds } }, select: { assignedPlotId: true, status: true } }),
  ]);

  const droneByPlot = new Map(droneMissionsByPlot.map((row) => [row.targetPlotId, row]));
  const robotByPlot = new Map(robotMissionsByPlot.map((row) => [row.targetPlotId, row]));

  return plots.map((plot) => {
    const plotFindings = findings.filter((f) => f.plotId === plot.id);
    const severityBreakdown = zeroSeverity();
    let activeFindings = 0;
    let resolvedFindings = 0;
    let robotInterventions = 0;
    for (const finding of plotFindings) {
      const severity = finding.severity as CropIssueSeverity;
      severityBreakdown[severity] = (severityBreakdown[severity] ?? 0) + 1;
      if (finding.resolvedAt) resolvedFindings += 1;
      else activeFindings += 1;
      // `correctiveActionType` (not `resolvedByRobotMissionId`) is the
      // canonical "a robot performed a corrective action" signal — see
      // `getRobotEffectiveness`'s doc comment above for why.
      if (finding.correctiveActionType) robotInterventions += 1;
    }

    const recentFindings: PlotRecentFinding[] = plotFindings.slice(0, RECENT_FINDINGS_PER_PLOT).map((f) => ({
      id: f.id,
      issueType: f.issueType.replaceAll("_", "-") as CropIssueType,
      severity: f.severity as CropIssueSeverity,
      status: f.status.replaceAll("_", "-") as "detected" | "resolved" | "requires-human-action",
      detectedAt: f.detectedAt.getTime(),
      resolvedAt: f.resolvedAt ? f.resolvedAt.getTime() : null,
    }));

    const droneRow = droneByPlot.get(plot.id);
    const robotRow = robotByPlot.get(plot.id);
    const lastDroneAt = droneRow?._max.createdAt?.getTime() ?? null;
    const lastRobotAt = robotRow?._max.createdAt?.getTime() ?? null;
    const lastMissionAt = lastDroneAt && lastRobotAt ? Math.max(lastDroneAt, lastRobotAt) : (lastDroneAt ?? lastRobotAt);

    const plotSensors = sensorsByPlot.filter((s) => s.assignedPlotId === plot.id);
    const sensors = { total: plotSensors.length, online: 0, warning: 0, critical: 0, offline: 0 };
    for (const sensor of plotSensors) {
      if (sensor.status === "online") sensors.online += 1;
      else if (sensor.status === "warning") sensors.warning += 1;
      else if (sensor.status === "critical") sensors.critical += 1;
      else if (sensor.status === "offline") sensors.offline += 1;
    }

    return {
      plotId: plot.id,
      plotLabel: plot.label,
      activeFindings,
      resolvedFindings,
      severityBreakdown,
      recentFindings,
      droneMissionCount: droneRow?._count._all ?? 0,
      robotMissionCount: robotRow?._count._all ?? 0,
      lastMissionAt,
      sensors,
      robotInterventions,
    };
  });
}

// ---------------------------------------------------------------------------
// Combined snapshot
// ---------------------------------------------------------------------------

export interface FarmHistoricalAnalytics {
  generatedAt: number;
  findings: FindingsHistory;
  missions: MissionActivityHistory;
  robotEffectiveness: RobotEffectiveness;
  plotHealth: PlotHealthOverview[];
}

export async function getFarmHistoricalAnalytics(farmId: string): Promise<FarmHistoricalAnalytics> {
  const [findings, missions, robotEffectiveness, plotHealth] = await Promise.all([
    getFindingsHistory(farmId),
    getMissionActivityHistory(farmId),
    getRobotEffectiveness(farmId),
    getPlotHealthOverviews(farmId),
  ]);

  return { generatedAt: Date.now(), findings, missions, robotEffectiveness, plotHealth };
}
