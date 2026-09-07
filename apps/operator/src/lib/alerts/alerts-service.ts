import "server-only";

import { prisma } from "@/lib/prisma/client";
import type { CropIssueType } from "@/lib/findings/types";
import type { AlertSeverity, AlertType, SensorAlertRecord } from "@/lib/sensor-analytics/types";

import type { AlertType as PrismaAlertType, AlertSeverity as PrismaAlertSeverity, CropIssueType as PrismaIssueType } from "@/lib/prisma/generated/enums";

function toDomainIssueType(issueType: PrismaIssueType): CropIssueType {
  return issueType.replaceAll("_", "-") as CropIssueType;
}

/**
 * Server-only Alert data access — the ONLY module that
 * touches `prisma.alert`. Every function takes `farmId` as an explicit,
 * required argument and every caller (the API routes) derives it from the
 * authenticated session via `getFarmForSession`, never from client input —
 * this is what makes the ownership boundary real rather than advisory.
 *
 * Converts between Prisma's generated enum members (`low_battery`, valid JS
 * identifiers) and the frontend's own `AlertType`/`AlertSeverity` string
 * literals (`"low-battery"`, matching `sensor-analytics/types.ts` exactly) —
 * the `@map(...)` in schema.prisma makes these the SAME value at the SQL
 * level; only the TypeScript-facing enum member spelling differs, which is
 * why this file exists rather than passing frontend strings straight into
 * Prisma calls.
 */

type AlertRow = {
  id: string;
  /** Nullable — a deleted Sensor's alerts keep their record via `onDelete: SetNull`. See `SensorAlertRecord.sensorId`'s own doc comment. */
  sensorId: string | null;
  sensorName: string;
  alertType: PrismaAlertType;
  severity: PrismaAlertSeverity;
  message: string;
  value: number | null;
  createdAt: Date;
  resolvedAt: Date | null;
  findingId: string | null;
  /** Present only when the row was fetched `include`-ing this relation; every query below does. */
  finding: { plotId: string; issueType: PrismaIssueType; positionX: number; positionZ: number; plot: { label: string } } | null;
};

function toDomainAlert(row: AlertRow): SensorAlertRecord {
  return {
    id: row.id,
    sensorId: row.sensorId,
    sensorName: row.sensorName,
    alertType: row.alertType.replaceAll("_", "-") as AlertType,
    severity: row.severity as AlertSeverity,
    message: row.message,
    value: row.value,
    createdAt: row.createdAt.getTime(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.getTime() : null,
    findingId: row.findingId,
    findingPlotId: row.finding?.plotId ?? null,
    findingPlotLabel: row.finding?.plot.label ?? null,
    findingIssueType: row.finding ? toDomainIssueType(row.finding.issueType) : null,
    findingPosition: row.finding ? [row.finding.positionX, row.finding.positionZ] : null,
  };
}

function toPrismaAlertType(alertType: AlertType): PrismaAlertType {
  return alertType.replaceAll("-", "_") as PrismaAlertType;
}

/** Newest first, capped — the Alerts page shows recent history, not the entire unbounded table ("avoid fetching the entire alert history"). */
const LIST_LIMIT = 200;

const includeFinding = { finding: { include: { plot: { select: { label: true } } } } } as const;

export async function listAlerts(farmId: string): Promise<SensorAlertRecord[]> {
  const rows = await prisma.alert.findMany({
    where: { farmId },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    include: includeFinding,
  });
  return rows.map(toDomainAlert);
}

export interface CreateAlertInput {
  sensorId: string;
  sensorName: string;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  value: number;
}

export async function createAlert(farmId: string, input: CreateAlertInput): Promise<SensorAlertRecord> {
  const row = await prisma.alert.create({
    data: {
      farmId,
      sensorId: input.sensorId,
      sensorName: input.sensorName,
      alertType: toPrismaAlertType(input.alertType),
      severity: input.severity,
      message: input.message,
      value: input.value,
    },
    include: includeFinding,
  });
  return toDomainAlert(row);
}

export interface UpsertFindingAlertInput {
  findingId: string;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  resolved: boolean;
}

/**
 * The CropFinding → Alert write path, mirrors
 * `createFinding`'s own upsert-by-id pattern in `findings-service.ts`
 * exactly, except upserting by `findingId` (unique) rather than `id`: the
 * client's `syncFindingAlert` calls this both the first time a finding is
 * seen AND again when it later resolves, so this single call needs to
 * both create and update. Returns `null` (never throws) if the finding
 * doesn't exist or belongs to a different farm — same non-leaking 400
 * pattern `createFinding` already establishes for `plotId`.
 */
export async function upsertFindingAlert(farmId: string, input: UpsertFindingAlertInput): Promise<SensorAlertRecord | null> {
  const finding = await prisma.cropFinding.findUnique({ where: { id: input.findingId }, select: { farmId: true, plotId: true, plot: { select: { label: true } } } });
  if (!finding || finding.farmId !== farmId) return null;

  const data = {
    farmId,
    sensorId: null,
    sensorName: finding.plot.label,
    alertType: toPrismaAlertType(input.alertType),
    severity: input.severity,
    message: input.message,
    value: null,
    resolvedAt: input.resolved ? new Date() : null,
  };

  const row = await prisma.alert.upsert({
    where: { findingId: input.findingId },
    create: { findingId: input.findingId, ...data },
    // Never overwrite an already-set `resolvedAt` with a later, different
    // timestamp on a repeat sync — a resolved alert's resolution moment
    // stays fixed, mirroring `resolveAlert`'s own `existing.resolvedAt ??
    // new Date()` idempotency below.
    update: { ...data, resolvedAt: undefined },
    include: includeFinding,
  });

  // Apply the "don't clobber an existing resolvedAt" rule the `update`
  // branch above couldn't express declaratively (Prisma's `update` payload
  // can't reference the row's own current value) — if this call is
  // resolving the alert for the first time, set it now.
  if (input.resolved && !row.resolvedAt) {
    const resolvedRow = await prisma.alert.update({ where: { id: row.id }, data: { resolvedAt: new Date() }, include: includeFinding });
    return toDomainAlert(resolvedRow);
  }

  return toDomainAlert(row);
}

/** Returns `null` (not an error) if the alert doesn't exist or belongs to a different farm — callers turn that into 404, never revealing which case it was, so a farmId probe can't distinguish "wrong id" from "someone else's alert." */
export async function resolveAlert(farmId: string, alertId: string): Promise<SensorAlertRecord | null> {
  const existing = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!existing || existing.farmId !== farmId) return null;

  const row = await prisma.alert.update({
    where: { id: alertId },
    data: { resolvedAt: existing.resolvedAt ?? new Date() },
    include: includeFinding,
  });
  return toDomainAlert(row);
}
