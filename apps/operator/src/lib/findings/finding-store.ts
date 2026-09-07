"use client";

import { useMemo } from "react";
import { create } from "zustand";

import { useAlertStore } from "@/lib/sensor-analytics/alert-store";

import type { CropIssueCandidate } from "./issue-generator";
import {
  ROBOT_ISSUE_CAPABILITIES,
  type CropFinding,
  type CropFindingDetectionMethod,
  type CropIssueSeverity,
  type CropIssueType,
  type InspectionSummary,
} from "./types";

/**
 * The Finding Store — the single source of truth
 * every consumer (both mission simulation ticks, the Mission Inspectors, the
 * Digital Twin's finding markers, AURA's context) reads from and writes to.
 * Mirrors `alert-store.ts`'s exact shape and persistence convention:
 *  - `recordDetection` applies the local update FIRST (so the calling
 *  simulation tick never blocks on a network round trip), then fires a
 *  best-effort background POST — same fire-and-forget pattern
 *  `openAlert`/`resolveAlert` already establish.
 *  - `recordDetection` is idempotent by construction: a candidate's
 *  `localId` becomes the finding's own id, so calling it again for a
 *  candidate the store already knows about is a guaranteed no-op — this
 *  is what Part 4/Part 5's "do not repeatedly create duplicate findings
 *  every frame" requirement is actually enforced by, not a separate
 *  "already checked this tick" flag.
 *  - `fetchFindings()` loads whatever's durable in Postgres on mount
 *  (merge-by-id, never clobbering a live in-session finding).
 */
interface FindingState {
  order: string[];
  findings: Record<string, CropFinding>;
  hydration: "idle" | "loading" | "loaded" | "error";
  hydrationError: string | null;
  /**
   * Candidate `localId`s that have been fully evaluated but never
   * became a `findings` entry under their OWN id: specifically, a candidate
   * that resolved a DIFFERENT, already-existing finding of the same plot +
   * issue type (see `recordDetection`'s dedup branch) rather than creating
   * its own row. Without this, the tick right after that resolution would
   * re-run `recordDetection` for the SAME still-in-range candidate, find no
   * more ACTIVE duplicate (it was just resolved), and create a genuine
   * second row for the same physical issue — exactly the duplicate-finding
   * bug Part 4/11 warns against. A normal candidate that becomes its own
   * finding doesn't need an entry here; `findings[candidate.localId]` alone
   * already short-circuits it.
   */
  handledCandidateIds: Record<string, true>;

  /**
   * Records one detected issue, or no-ops if this exact candidate (by
   * `localId`) was already recorded — safe to call every simulation tick
   * for every candidate still in scan range. `vehicle: "robot"` additionally
   * performs the simulated corrective action when the issue type has a real
   * robot capability (see `ROBOT_ISSUE_CAPABILITIES`) — never for "drone",
   * and never for an issue type absent from that map, regardless of vehicle
   * (Architectural Rule 2: never claim a repair that didn't happen).
   */
  recordDetection: (input: {
    candidate: CropIssueCandidate;
    plotId: string;
    plotLabel: string;
    missionId: string;
    missionName: string;
    vehicle: CropFindingDetectionMethod;
  }) => void;
  /**
   * Marks an EXISTING finding resolved in place — used when a robot mission
   * comes within scan range of a condition a different (often earlier
   * drone) mission already reported, rather than creating a second row for
   * the same physical issue. Never called for an issue type without a real
   * robot capability, and a no-op if the finding is already resolved.
   */
  resolveFinding: (findingId: string, robotMissionId: string) => void;
  fetchFindings: () => Promise<void>;
}

function persistCreate(finding: CropFinding): void {
  fetch("/api/findings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(finding),
  }).catch(() => {
    // Best-effort — mirrors alert-store.ts's persistCreate: a failed persist
    // must never break the (synchronous, real-time) in-memory finding it
    // backs. A finding created this session but not yet durable is picked
    // up again on the next fetchFindings() reconciliation... unless the
    // session ends first, the same documented gap alert-store.ts already
    // accepts for the identical reason.
  });
}

export const useFindingStore = create<FindingState>((set, get) => ({
  order: [],
  findings: {},
  hydration: "idle",
  hydrationError: null,
  handledCandidateIds: {},

  recordDetection: ({ candidate, plotId, plotLabel, missionId, missionName, vehicle }) => {
    // already detected under its own id, OR already evaluated and resolved
    // a DIFFERENT finding instead (see `handledCandidateIds`'s doc comment)
    // — either way, never re-evaluate the same still-in-range candidate.
    if (get().findings[candidate.localId] || get().handledCandidateIds[candidate.localId]) return;

    const capability = ROBOT_ISSUE_CAPABILITIES[candidate.issueType];

    // Cross-mission dedup, resolution-aware: a LATER
    // mission scanning the same plot generates its own, differently-seeded
    // candidate set (see `issue-generator.ts`'s doc comment), so without
    // SOME guard a second mission could report a brand-new finding row for
    // the same physical condition an earlier mission already found. But the
    // guard must not block the exact workflow Part 5 asks for — "drone
    // detects an issue, a LATER robot mission travels to it and resolves
    // it" — so when the plot already has an ACTIVE (non-resolved) finding
    // of this issue type:
    //  - a capable robot RESOLVES that existing finding in place (the
    //  schema's `resolvedByRobotMissionId` field exists for exactly
    //  this: a robot resolving a finding it didn't itself detect) rather
    //  than creating a second row for the same condition;
    //  - anything else (a drone, or a robot without a capability for this
    //  type) just skips — a true duplicate report of a condition already
    //  open.
    // Once resolved, a LATER mission CAN report a fresh occurrence of the
    // same issue type (weeds regrow, standing water recurs) — this only
    // suppresses re-reporting a condition that's already open.
    const activeDuplicate = Object.values(get().findings).find(
      (existing) => existing.plotId === plotId && existing.issueType === candidate.issueType && existing.status !== "resolved",
    );
    if (activeDuplicate) {
      if (vehicle === "robot" && capability) get().resolveFinding(activeDuplicate.id, missionId);
      // This candidate will never become its own `findings` entry — record
      // it as handled so the next tick (while still in range) doesn't
      // re-run this whole check and find "no more active duplicate" (since
      // the line above may have just resolved it) and create a genuine
      // second row for the same physical issue.
      set((state) => ({ handledCandidateIds: { ...state.handledCandidateIds, [candidate.localId]: true } }));
      return;
    }

    const robotResolves = vehicle === "robot" && Boolean(capability);
    const now = Date.now();

    const finding: CropFinding = {
      id: candidate.localId,
      plotId,
      plotLabel,
      issueType: candidate.issueType,
      severity: candidate.severity,
      position: candidate.position,
      description: candidate.description,
      status: robotResolves ? "resolved" : capability ? "detected" : "requires-human-action",

      detectionMethod: vehicle,
      detectedByDroneMissionId: vehicle === "drone" ? missionId : null,
      detectedByRobotMissionId: vehicle === "robot" ? missionId : null,
      detectedByMissionName: missionName,

      correctiveActionType: robotResolves ? capability!.actionType : null,
      correctiveActionDescription: robotResolves ? capability!.describeAction({ plotLabel }) : null,
      resolvedByRobotMissionId: robotResolves ? missionId : null,

      detectedAt: now,
      resolvedAt: robotResolves ? now : null,
    };

    set((state) => ({
      order: [...state.order, finding.id],
      findings: { ...state.findings, [finding.id]: finding },
    }));
    persistCreate(finding);
    // CropFinding stays the source of truth; the Alert
    // Store's own dedup (by findingId) means this is always safe to call,
    // whether the finding is still active or was resolved in this same
    // pass (a robot detecting-and-instantly-resolving a capable issue).
    useAlertStore.getState().syncFindingAlert(finding);
  },

  resolveFinding: (findingId, robotMissionId) => {
    const existing = get().findings[findingId];
    if (!existing || existing.status === "resolved") return; // already resolved (or unknown id) — never a duplicate resolution
    const capability = ROBOT_ISSUE_CAPABILITIES[existing.issueType];
    if (!capability) return; // Architectural Rule 2: never claim a repair that didn't happen

    const updated: CropFinding = {
      ...existing,
      status: "resolved",
      correctiveActionType: capability.actionType,
      correctiveActionDescription: capability.describeAction({ plotLabel: existing.plotLabel }),
      resolvedByRobotMissionId: robotMissionId,
      resolvedAt: Date.now(),
    };

    set((state) => ({ findings: { ...state.findings, [findingId]: updated } }));
    // Same upsert-by-id endpoint `persistCreate` already posts to —
    // `createFinding`'s server-side `prisma.cropFinding.upsert` updates the
    // existing row when the id already exists, so no new API route is
    // needed to persist a resolution.
    persistCreate(updated);
    // Flips the finding's existing alert to resolved.
    useAlertStore.getState().syncFindingAlert(updated);
  },

  fetchFindings: async () => {
    if (get().hydration === "loading") return;
    set({ hydration: "loading", hydrationError: null });

    try {
      const response = await fetch("/api/findings");
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${response.status}).`);
      }
      const body = (await response.json()) as { findings: CropFinding[] };

      // Authoritative replace: the fresh farm-scoped response's
      // ids ARE the complete next finding set, never an addition to whatever
      // was already here (closes additive-only
      // reconciliation risk — `if (nextFindings[finding.id]) continue` used
      // to mean a finding from a previous farm/session could never be
      // removed). A `CropFinding` has no local-only live field distinct from
      // what `recordDetection`/`resolveFinding` already (fire-and-forget)
      // persist the moment they mutate it, so the fresh record is always
      // adopted wholesale for a surviving id — same simple case
      // `plot-store.ts` already established, not the sensor/mission-style
      // per-field split.
      const nextFindings: Record<string, CropFinding> = {};
      const nextOrder: string[] = [];
      for (const finding of body.findings) {
        nextFindings[finding.id] = finding;
        nextOrder.push(finding.id);
      }
      set({ findings: nextFindings, order: nextOrder, hydration: "loaded", hydrationError: null });
    } catch (error) {
      set({ hydration: "error", hydrationError: error instanceof Error ? error.message : "Failed to load findings." });
    }
  },
}));

export function useFindingOrder(): string[] {
  return useFindingStore((state) => state.order);
}

export function useFindings(): CropFinding[] {
  const order = useFindingOrder();
  const findings = useFindingStore((state) => state.findings);
  return useMemo(() => order.map((id) => findings[id]).filter((finding): finding is CropFinding => Boolean(finding)), [order, findings]);
}

export function useFindingsForMission(missionId: string | null): CropFinding[] {
  const all = useFindings();
  return useMemo(
    () =>
      missionId
        ? all.filter(
            (finding) =>
              finding.detectedByDroneMissionId === missionId ||
              finding.detectedByRobotMissionId === missionId ||
              // A robot mission that RESOLVES a finding a
              // different (often earlier drone) mission detected should
              // still show up in ITS OWN Inspection Findings card; without
              // this, "the robot travels to an existing issue and resolves
              // it" workflow would be invisible on the resolving mission's
              // own inspector.
              finding.resolvedByRobotMissionId === missionId,
          )
        : [],
    [all, missionId],
  );
}

export function useFindingsForPlot(plotId: string | null): CropFinding[] {
  const all = useFindings();
  return useMemo(() => (plotId ? all.filter((finding) => finding.plotId === plotId) : []), [all, plotId]);
}

/** Non-reactive snapshot lookup — for the simulation tick loops and AURA's context builder, mirroring `getPlotById`'s own `.getState()` convention. Mirrors `useFindingsForMission`'s "detected OR resolved by this mission" scope exactly. */
export function getFindingsForMission(missionId: string): CropFinding[] {
  return Object.values(useFindingStore.getState().findings).filter(
    (finding) => finding.detectedByDroneMissionId === missionId || finding.detectedByRobotMissionId === missionId || finding.resolvedByRobotMissionId === missionId,
  );
}

const EMPTY_SEVERITY_COUNTS: Record<CropIssueSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };

/**
 * Part 7's "mission result contains inspection summary" — computed fresh
 * from real findings every call, never cached/fabricated, mirroring
 * `getAllPlotRecommendations()`'s own "recompute per question" convention.
 */
export function buildInspectionSummary(missionId: string): InspectionSummary {
  const findings = getFindingsForMission(missionId);

  const bySeverity = { ...EMPTY_SEVERITY_COUNTS };
  const byType: Partial<Record<CropIssueType, number>> = {};
  let resolvedCount = 0;
  let requiresHumanActionCount = 0;
  const recommendedHumanActions: string[] = [];

  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    byType[finding.issueType] = (byType[finding.issueType] ?? 0) + 1;
    if (finding.status === "resolved") resolvedCount += 1;
    if (finding.status === "requires-human-action") {
      requiresHumanActionCount += 1;
      recommendedHumanActions.push(finding.description);
    }
  }

  return {
    totalDetected: findings.length,
    bySeverity,
    byType,
    resolvedCount,
    unresolvedCount: findings.length - resolvedCount,
    requiresHumanActionCount,
    recommendedHumanActions,
  };
}
