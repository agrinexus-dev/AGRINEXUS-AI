"use client";

import { useMemo } from "react";
import { create } from "zustand";

import type { CropFinding, CropIssueSeverity } from "@/lib/findings/types";

import type { AlertSeverity, AlertType, SensorAlertRecord } from "./types";

/** CropIssueSeverity (4 levels) → AlertSeverity (2 levels) — a deliberate, documented lossy mapping, not a schema change: the Alert model's own `severity` stays the same 2-value enum every existing sensor alert already uses, while the FULL precise severity is always available via `findingId`'s join back to the CropFinding record (the Alerts page reads it from there, never from this coarse bucket). */
function toAlertSeverity(severity: CropIssueSeverity): AlertSeverity {
  return severity === "high" || severity === "critical" ? "critical" : "warning";
}

/**
 * Smart Alerts — generates and holds alert RECORDS only; no
 * notification/toast/email delivery this change (explicit prompt
 * instruction). `use-alert-simulation.ts` is the only writer of NEW alerts:
 * it evaluates live Sensor Store readings against `threshold-store.ts` each
 * tick and opens/resolves alerts here. An alert is never deleted, only
 * resolved (`resolvedAt` set), so the record stays a truthful history.
 *
 * This change extends this SAME store (not a second one — see that prompt's
 * explicit "do not create duplicate sources of truth") with backend
 * persistence: `fetchAlerts()` loads whatever's already durable in Postgres
 * on mount, and `openAlert`/`resolveAlert` best-effort persist any NEW
 * state change through `/api/alerts`. Every existing caller
 * (`use-alert-simulation.ts`, `mission-integration.ts`,
 * `energy-page.tsx`, `alerts-page.tsx`) keeps calling the exact same
 * `openAlert`/`resolveAlert`/`useAlerts`/`useActiveAlerts` API — nothing
 * about this store's external shape changed.
 *
 * Known, deliberate limitation (documented rather than solved under this
 * narrow prompt's scope): an alert created THIS session gets a local
 * `alert-N` id immediately (so real-time reasoning — Digital Twin, AURA —
 * never waits on a network round trip) while its persisted copy gets its
 * own database id; if that same alert is resolved before the next
 * `fetchAlerts()` reconciles them, the resolve-persist call has no matching
 * row to update and is silently dropped (caught, never thrown — a
 * persistence gap, not a UI-breaking error). An alert that WAS loaded via
 * `fetchAlerts()` (so its id already IS the real database id) resolves
 * correctly end-to-end. See the report.
 */
interface AlertState {
  order: string[];
  alerts: Record<string, SensorAlertRecord>;
  hydration: "idle" | "loading" | "loaded" | "error";
  hydrationError: string | null;
  /** Opens a new alert, or no-ops if an unresolved alert of the same (sensorId, alertType) pair already exists — callers don't need to check first. */
  openAlert: (input: { sensorId: string; sensorName: string; alertType: AlertType; severity: AlertSeverity; message: string; value: number }) => void;
  /** Resolves the open alert for this (sensorId, alertType) pair, if one exists. */
  resolveAlert: (sensorId: string, alertType: AlertType) => void;
  /**
   * The CropFinding → Alert bridge. Dedups by `findingId`
   * (one finding, at most one alert, ever): creates the alert the first
   * time a finding is seen (already resolved at creation if the finding
   * was — e.g. a robot that detects-and-instantly-resolves a capable
   * issue in one pass), and flips an EXISTING open alert to resolved once
   * the finding resolves later. Never creates a second alert for a finding
   * that already has one. Call this from `finding-store.ts` right after
   * `recordDetection`/`resolveFinding` change a finding — CropFinding
   * stays the source of truth; this only keeps the Alert mirror in sync.
   */
  syncFindingAlert: (finding: CropFinding) => void;
  /** Loads persisted alerts from `/api/alerts` into this same store. Safe to call multiple times (e.g. once per Alerts page mount) — already-known ids are left as-is rather than overwritten, so it never clobbers a change made locally since the last fetch. */
  fetchAlerts: () => Promise<void>;
}

let idSuffix = 0;
function generateAlertId(): string {
  idSuffix += 1;
  return `alert-${idSuffix}`;
}

/** Fire-and-forget persistence — logged, never thrown; a failed persist must never break the (synchronous, real-time) in-memory alert this backs. */
function persistCreate(record: SensorAlertRecord): void {
  fetch("/api/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sensorId: record.sensorId,
      sensorName: record.sensorName,
      alertType: record.alertType,
      severity: record.severity,
      message: record.message,
      value: record.value,
    }),
  }).catch(() => {
    // Best-effort — see this file's own doc comment on why a persistence
    // failure never surfaces as a user-facing error here.
  });
}

function persistResolve(alertId: string): void {
  fetch(`/api/alerts/${alertId}/resolve`, { method: "POST" }).catch(() => {
    // Best-effort — see this file's own doc comment (also covers the
    // documented local-id-vs-database-id gap, which surfaces as a normal
    // 404 here and is intentionally swallowed).
  });
}

export const useAlertStore = create<AlertState>((set, get) => ({
  order: [],
  alerts: {},
  hydration: "idle",
  hydrationError: null,

  openAlert: ({ sensorId, sensorName, alertType, severity, message, value }) => {
    const alreadyOpen = Object.values(get().alerts).some((alert) => alert.sensorId === sensorId && alert.alertType === alertType && alert.resolvedAt === null);
    if (alreadyOpen) return;

    const id = generateAlertId();
    const record: SensorAlertRecord = {
      id,
      sensorId,
      sensorName,
      alertType,
      severity,
      message,
      value,
      createdAt: Date.now(),
      resolvedAt: null,
      findingId: null,
      findingPlotId: null,
      findingPlotLabel: null,
      findingIssueType: null,
      findingPosition: null,
    };
    set((state) => ({ order: [...state.order, id], alerts: { ...state.alerts, [id]: record } }));
    persistCreate(record);
  },

  // LOCAL-ONLY optimistic mirror (no network call here
  // anymore). Persistence now happens server-side, inside
  // `findings-service.ts`'s own `createFinding` — in the SAME function
  // call that creates/updates the finding row, guaranteeing the finding
  // already exists before its alert is written. An earlier version of
  // this action independently POSTed to `/api/alerts` right after
  // `finding-store.ts`'s own `POST /api/findings` — two fire-and-forget
  // requests racing each other, where the alert upsert could reach the
  // server (and be rejected as "finding doesn't exist") before the
  // finding's own insert had committed. This action still exists so the
  // UI updates instantly rather than waiting for the next `fetchAlerts()`
  // — it just no longer duplicates the write the server already made.
  syncFindingAlert: (finding) => {
    const existing = Object.values(get().alerts).find((alert) => alert.findingId === finding.id);
    const nowResolved = finding.status === "resolved";

    if (!existing) {
      const id = generateAlertId();
      const record: SensorAlertRecord = {
        id,
        sensorId: null,
        sensorName: "",
        alertType: "crop-finding",
        severity: toAlertSeverity(finding.severity),
        message: finding.description,
        value: null,
        createdAt: finding.detectedAt,
        resolvedAt: finding.resolvedAt,
        findingId: finding.id,
        findingPlotId: finding.plotId,
        findingPlotLabel: finding.plotLabel,
        findingIssueType: finding.issueType,
        findingPosition: finding.position,
      };
      set((state) => ({ order: [...state.order, id], alerts: { ...state.alerts, [id]: record } }));
      return;
    }

    // Already resolved, or the finding hasn't resolved (yet) — nothing to
    // sync. This is what keeps a resolved finding from ever "continuously
    // recreating its alert": the alert already exists, so we only ever
    // fall through to the resolve branch below, never back to creation.
    if (existing.resolvedAt !== null || !nowResolved) return;

    const updated: SensorAlertRecord = { ...existing, resolvedAt: finding.resolvedAt };
    set((state) => ({ alerts: { ...state.alerts, [existing.id]: updated } }));
  },

  resolveAlert: (sensorId, alertType) => {
    const open = Object.values(get().alerts).find((alert) => alert.sensorId === sensorId && alert.alertType === alertType && alert.resolvedAt === null);
    if (!open) return;
    set((state) => ({ alerts: { ...state.alerts, [open.id]: { ...open, resolvedAt: Date.now() } } }));
    persistResolve(open.id);
  },

  fetchAlerts: async () => {
    if (get().hydration === "loading") return;
    set({ hydration: "loading", hydrationError: null });

    try {
      const response = await fetch("/api/alerts");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${response.status}).`);
      }
      const body = (await response.json()) as { alerts: SensorAlertRecord[] };

      // Authoritative replace: the fresh farm-scoped response's
      // ids ARE the complete next alert set, never an addition to whatever
      // was already here (closes additive-only
      // reconciliation risk — `if (nextAlerts[alert.id]) continue` used to
      // mean an alert from a previous farm/session could never be removed).
      // A `SensorAlertRecord` has no local-only live field distinct from
      // what `openAlert`/`resolveAlert`/`syncFindingAlert` already mutate
      // directly, so the fresh record is always adopted wholesale for a
      // surviving id — same simple case `plot-store.ts` already established.
      const nextAlerts: Record<string, SensorAlertRecord> = {};
      const nextOrder: string[] = [];
      for (const alert of body.alerts) {
        nextAlerts[alert.id] = alert;
        nextOrder.push(alert.id);
      }
      set({ alerts: nextAlerts, order: nextOrder, hydration: "loaded", hydrationError: null });
    } catch (error) {
      set({ hydration: "error", hydrationError: error instanceof Error ? error.message : "Failed to load alerts." });
    }
  },
}));

export function useAlertOrder(): string[] {
  return useAlertStore((state) => state.order);
}

export function useAlerts(): SensorAlertRecord[] {
  const order = useAlertOrder();
  const alerts = useAlertStore((state) => state.alerts);
  return useMemo(() => order.map((id) => alerts[id]).filter((alert): alert is SensorAlertRecord => Boolean(alert)), [order, alerts]);
}

export function useActiveAlerts(): SensorAlertRecord[] {
  const all = useAlerts();
  return useMemo(() => all.filter((alert) => alert.resolvedAt === null), [all]);
}

/** Read-only hydration status for the Alerts page's loading/error UI. */
export function useAlertHydration(): { status: AlertState["hydration"]; error: string | null } {
  const status = useAlertStore((state) => state.hydration);
  const error = useAlertStore((state) => state.hydrationError);
  return { status, error };
}
