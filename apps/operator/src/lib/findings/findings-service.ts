import "server-only";

import { upsertFindingAlert } from "@/lib/alerts/alerts-service";
import { prisma } from "@/lib/prisma/client";

import type {
  CropFindingDetectionMethod as PrismaDetectionMethod,
  CropFindingStatus as PrismaFindingStatus,
  CropIssueSeverity as PrismaIssueSeverity,
  CropIssueType as PrismaIssueType,
} from "@/lib/prisma/generated/enums";

import type { CropFinding, CropFindingDetectionMethod, CropFindingStatus, CropIssueSeverity, CropIssueType } from "./types";

/**
 * Server-only Crop Finding data access — mirrors
 * `alerts-service.ts`/`missions-service.ts`'s exact shape. Every function
 * takes `farmId` explicitly, every caller derives it from the authenticated
 * session (`getFarmForSession`), never from client input. `plotId` is
 * validated against the SAME farm on every create — the identical
 * anti-cross-farm-reference rule `missions-service.ts`'s
 * `relationsBelongToFarm` already establishes for `targetPlotId`.
 */

function toPrismaIssueType(issueType: CropIssueType): PrismaIssueType {
  return issueType.replaceAll("-", "_") as PrismaIssueType;
}
function toDomainIssueType(issueType: PrismaIssueType): CropIssueType {
  return issueType.replaceAll("_", "-") as CropIssueType;
}
function toPrismaStatus(status: CropFindingStatus): PrismaFindingStatus {
  return status.replaceAll("-", "_") as PrismaFindingStatus;
}
function toDomainStatus(status: PrismaFindingStatus): CropFindingStatus {
  return status.replaceAll("_", "-") as CropFindingStatus;
}

type FindingRow = {
  id: string;
  plotId: string;
  plot: { label: string };
  issueType: PrismaIssueType;
  severity: PrismaIssueSeverity;
  positionX: number;
  positionZ: number;
  description: string;
  status: PrismaFindingStatus;
  detectionMethod: PrismaDetectionMethod;
  detectedByDroneMissionId: string | null;
  detectedByDroneMission: { name: string } | null;
  detectedByRobotMissionId: string | null;
  detectedByRobotMission: { name: string } | null;
  correctiveActionType: string | null;
  correctiveActionDescription: string | null;
  resolvedByRobotMissionId: string | null;
  detectedAt: Date;
  resolvedAt: Date | null;
};

function toDomainFinding(row: FindingRow): CropFinding {
  return {
    id: row.id,
    plotId: row.plotId,
    plotLabel: row.plot.label,
    issueType: toDomainIssueType(row.issueType),
    severity: row.severity as CropIssueSeverity,
    position: [row.positionX, row.positionZ],
    description: row.description,
    status: toDomainStatus(row.status),
    detectionMethod: row.detectionMethod as CropFindingDetectionMethod,
    detectedByDroneMissionId: row.detectedByDroneMissionId,
    detectedByRobotMissionId: row.detectedByRobotMissionId,
    detectedByMissionName: row.detectedByDroneMission?.name ?? row.detectedByRobotMission?.name ?? "Unknown mission",
    correctiveActionType: row.correctiveActionType,
    correctiveActionDescription: row.correctiveActionDescription,
    resolvedByRobotMissionId: row.resolvedByRobotMissionId,
    detectedAt: row.detectedAt.getTime(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.getTime() : null,
  };
}

const include = { plot: { select: { label: true } }, detectedByDroneMission: { select: { name: true } }, detectedByRobotMission: { select: { name: true } } } as const;

/** Newest first, capped — mirrors `alerts-service.ts`'s `LIST_LIMIT` convention (avoid fetching the entire unbounded table). */
const LIST_LIMIT = 500;

export async function listFindings(farmId: string): Promise<CropFinding[]> {
  const rows = await prisma.cropFinding.findMany({
    where: { farmId },
    orderBy: { detectedAt: "desc" },
    take: LIST_LIMIT,
    include,
  });
  return rows.map(toDomainFinding);
}

export interface CreateFindingInput {
  id: string;
  plotId: string;
  issueType: CropIssueType;
  severity: CropIssueSeverity;
  position: [number, number];
  description: string;
  status: CropFindingStatus;
  detectionMethod: CropFindingDetectionMethod;
  detectedByDroneMissionId: string | null;
  detectedByRobotMissionId: string | null;
  correctiveActionType: string | null;
  correctiveActionDescription: string | null;
  resolvedByRobotMissionId: string | null;
  detectedAt: number;
  resolvedAt: number | null;
}

/** Returns `null` (never throws) if `plotId` doesn't belong to `farmId` — the route answers 400, same non-leaking pattern every other service uses. Idempotent on `id` (upsert) — the client's own `recordDetection` guard already prevents most duplicate POSTs, but a retried fire-and-forget request must never create a second row for the same finding. */
export async function createFinding(farmId: string, input: CreateFindingInput): Promise<CropFinding | null> {
  const plot = await prisma.plot.findUnique({ where: { id: input.plotId }, select: { farmId: true } });
  if (!plot || plot.farmId !== farmId) return null;

  const data = {
    farmId,
    plotId: input.plotId,
    issueType: toPrismaIssueType(input.issueType),
    severity: input.severity,
    positionX: input.position[0],
    positionZ: input.position[1],
    description: input.description,
    status: toPrismaStatus(input.status),
    detectionMethod: input.detectionMethod,
    detectedByDroneMissionId: input.detectedByDroneMissionId,
    detectedByRobotMissionId: input.detectedByRobotMissionId,
    correctiveActionType: input.correctiveActionType,
    correctiveActionDescription: input.correctiveActionDescription,
    resolvedByRobotMissionId: input.resolvedByRobotMissionId,
    detectedAt: new Date(input.detectedAt),
    resolvedAt: input.resolvedAt ? new Date(input.resolvedAt) : null,
  };

  const row = await prisma.cropFinding.upsert({
    where: { id: input.id },
    create: { id: input.id, ...data },
    update: data,
    include,
  });

  // CropFinding → Alert, done HERE (server-side, same
  // function, after the finding row above is guaranteed to exist) rather
  // than as a second client-triggered POST. The first attempt at this
  // integration had the client fire `POST /api/findings` and `POST
  // /api/alerts` as two independent fire-and-forget requests right after
  // each other — a genuine race where the alert upsert could reach the
  // server (and get rejected, "finding doesn't exist") before the
  // finding's own insert had committed. Folding the alert write into this
  // same call eliminates that race entirely: by the time `upsertFindingAlert`
  // runs, `row` above already exists.
  await upsertFindingAlert(farmId, {
    findingId: row.id,
    alertType: "crop-finding",
    severity: toAlertSeverity(input.severity),
    message: input.description,
    resolved: input.status === "resolved",
  });

  return toDomainFinding(row);
}

/** CropIssueSeverity (4 levels) → AlertSeverity (2 levels) — server-side twin of `alert-store.ts`'s identical client-side mapping (that file is `"use client"`, so this couldn't just import it); see that file's own doc comment for the full reasoning. */
function toAlertSeverity(severity: PrismaIssueSeverity): "warning" | "critical" {
  return severity === "high" || severity === "critical" ? "critical" : "warning";
}
