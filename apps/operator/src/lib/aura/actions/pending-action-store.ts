"use client";

import { create } from "zustand";

import type { MissionType } from "@/lib/missions/types";
import type { RobotMissionType } from "@/lib/robot-missions/types";

import type { MissionIntentKind } from "../types";

/**
 * "Safe Action Confirmation." Before this change,
 * `handle-selected-finding` checked capability + availability and
 * then IMMEDIATELY created/assigned/started a real mission in one turn. Part
 * 13 explicitly requires a confirm step for a consequential action
 * ("Would you like me to assign the mission?" -> "Yes." -> then create).
 * This store holds exactly the one proposal currently awaiting a yes/no
 * reply — never persisted (a stray "yes" days later, after a reload, must
 * never resurrect a proposal) and expires on its own after a short window
 * so a "yes" typed long after the proposal scrolled off screen doesn't
 * silently fire.
 */

export interface PendingHandleFindingAction {
  kind: "handle-selected-finding";
  findingId: string;
  missionType: RobotMissionType;
  robotId: string;
  proposedAt: number;
}

/**
 * AURA Natural-Language-Actions phase, Parts 6/7 — the proposal behind a
 * natural-language field-inspection request ("Check field A") that hasn't
 * been tied to an already-detected finding. Exactly one of
 * `robotMissionType`/`droneMissionType` (+ matching `robotId`/`droneId`) is
 * set, matching `vehicleKind` — same "two nullable typed fields, never a
 * polymorphic shape" convention `CropFinding.detectedByDroneMissionId`/
 * `detectedByRobotMissionId` already establishes server-side.
 */
export interface PendingFieldInspectionAction {
  kind: "field-inspection";
  plotId: string;
  plotLabel: string;
  vehicleKind: "robot" | "drone";
  robotMissionType?: RobotMissionType;
  robotId?: string;
  droneMissionType?: MissionType;
  droneId?: string;
  /**
   * the ORIGINAL problem keyword/intent behind this proposal, carried along
   * purely so a farmer's follow-up vehicle correction ("Use the drone
   * instead.") can re-run the exact same resolution
   * (`handleFieldInspectionRequest`) with only the vehicle preference
   * changed — never a re-guess at what the farmer originally asked for.
   * `undefined`/`"inspect"` for a plain "Check field A." with nothing to
   * carry forward.
   */
  reportedProblemKeyword?: string;
  missionIntent?: MissionIntentKind;
  proposedAt: number;
}

/**
 * "cancellation
 * should require appropriate confirmation." Mirrors the other two pending-
 * action kinds exactly: nothing is cancelled yet, this only records WHICH
 * real mission a "yes" would cancel. Re-verified from scratch at confirm
 * time (see `action-executor.ts`'s `confirm-pending-action` case) — never
 * trusts that the mission is still in a cancellable state just because it
 * was when this was proposed.
 */
export interface PendingMissionCancelAction {
  kind: "mission-control-cancel";
  vehicleKind: "robot" | "drone";
  missionId: string;
  missionName: string;
  proposedAt: number;
}

/**
 * The farmer asked to pause/resume/cancel "the mission"/"it" while more than one
 * real mission was valid for that action; AURA asked which one instead of
 * guessing (Security rule 16). This remembers exactly which candidates were
 * offered so the very next reply — "Field B.", "The drone.", "Hag." — can be
 * resolved back to completing the SAME action, instead of falling through
 * to ordinary conversation (a real gap found in the live
 * testing: previously the clarifying question was asked correctly, but a
 * short reply naming just the field/vehicle was never connected back to it).
 * Never a guess itself — `resolveMissionClarification` (action-executor.ts)
 * only ever consumes this when the reply unambiguously names EXACTLY ONE of
 * these specific candidates; anything else clears it, same "stale pending
 * action" protection every other kind here already gets.
 */
export interface PendingMissionClarifyAction {
  kind: "mission-control-clarify";
  action: "pause" | "resume" | "cancel";
  candidates: { vehicleKind: "robot" | "drone"; missionId: string; missionName: string; plotLabel: string | null; vehicleName: string | null }[];
  proposedAt: number;
}

export type PendingAuraAction = PendingHandleFindingAction | PendingFieldInspectionAction | PendingMissionCancelAction | PendingMissionClarifyAction;

/**
 * A plain `Omit<PendingAuraAction, "proposedAt">` does NOT distribute over
 * the union the way you'd expect — TS flattens it into a shape that loses
 * each member's own distinct fields. `T extends any ?... : never` over a
 * GENERIC type parameter (unlike a concrete alias) genuinely distributes
 * across each union member, so `propose()` still accepts exactly "any
 * pending-action shape, minus `proposedAt`," with every member's own fields
 * intact.
 */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type NewPendingAuraAction = DistributiveOmit<PendingAuraAction, "proposedAt">;

const PENDING_ACTION_TTL_MS = 5 * 60 * 1000;

interface PendingActionState {
  pending: PendingAuraAction | null;
  propose: (action: NewPendingAuraAction) => void;
  /** Returns the pending action if one exists AND hasn't expired, clearing it either way (a confirmation is consumed exactly once, whether it succeeds or has gone stale). */
  consume: () => PendingAuraAction | null;
  clear: () => void;
  hasPending: () => boolean;
}

export const usePendingActionStore = create<PendingActionState>((set, get) => ({
  pending: null,

  propose: (action) => set({ pending: { ...action, proposedAt: Date.now() } as PendingAuraAction }),

  consume: () => {
    const { pending } = get();
    set({ pending: null });
    if (!pending) return null;
    if (Date.now() - pending.proposedAt > PENDING_ACTION_TTL_MS) return null;
    return pending;
  },

  clear: () => set({ pending: null }),

  hasPending: () => {
    const { pending } = get();
    return pending !== null && Date.now() - pending.proposedAt <= PENDING_ACTION_TTL_MS;
  },
}));
