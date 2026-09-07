"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Bot, PlaneTakeoff } from "lucide-react";

import { Button, MissionCard, Typography, type Status } from "@agrinexus/ui";

import type { AppSessionUser } from "@/lib/auth/types";
import { cancelMissionById, pauseMissionById, resumeMissionById } from "@/lib/aura/actions/action-executor";
import { useAuraChatStore } from "@/lib/aura/client/aura-chat-store";
import type { AuraMissionRef } from "@/lib/aura/types";
import { useFindingStore } from "@/lib/findings/finding-store";
import { CROP_ISSUE_TYPE_LABELS } from "@/lib/findings/types";
import { useFleetStore } from "@/lib/fleet/fleet-store";
import { useMissionStore } from "@/lib/missions/mission-store";
import { MISSION_FLIGHT_STATUSES, MISSION_STATUS_LABELS, MISSION_TYPE_LABELS } from "@/lib/missions/types";
import { usePlotStore } from "@/lib/plots/plot-store";
import { ROBOT_MISSION_ACTIVE_STATUSES, ROBOT_MISSION_STATUS_LABELS, ROBOT_MISSION_TYPE_LABELS } from "@/lib/robot-missions/types";
import { useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";
import { useRobotStore } from "@/lib/robots/robot-store";

export interface AuraMissionCardProps {
  missionRef: AuraMissionRef;
}

/**
 * A live view over a REAL
 * mission in `useRobotMissionStore`/`useMissionStore`, rendered inline in
 * the AURA conversation next to whichever reply dispatched it. Every field
 * below is read straight from the live store via a Zustand selector — it
 * re-renders automatically as `use-mission-simulation.ts`/`use-robot-
 * mission-simulation.ts` tick, exactly like the Mission Planner's own
 * Inspector does, never a frozen snapshot or an invented number (Sections
 * 3–4). Pause/Resume/Cancel below call the EXACT SAME `pauseMissionById`/
 * `resumeMissionById`/`cancelMissionById` a typed "Pause it." goes through
 * (Security rule 33 — one execution path, two triggers).
 */
export function AuraMissionCard({ missionRef }: AuraMissionCardProps) {
  const { data: session } = useSession();
  const userRole = (session?.user as AppSessionUser | undefined)?.role ?? null;
  const appendAssistantNote = useAuraChatStore((state) => state.appendAssistantNote);

  const robotMission = useRobotMissionStore((state) => (missionRef.vehicleKind === "robot" ? state.missions[missionRef.missionId] : undefined));
  const droneMission = useMissionStore((state) => (missionRef.vehicleKind === "drone" ? state.missions[missionRef.missionId] : undefined));
  const mission = robotMission ?? droneMission;

  const assignedRobotName = useRobotStore((state) => (robotMission?.assignedRobotId ? state.robots[robotMission.assignedRobotId]?.name : undefined));
  const assignedDroneName = useFleetStore((state) => (droneMission?.assignedDroneId ? state.drones[droneMission.assignedDroneId]?.name : undefined));
  const assignedVehicleName = assignedRobotName ?? assignedDroneName;

  const targetPlotLabel = usePlotStore((state) => (mission?.targetPlotId ? state.plots[mission.targetPlotId]?.label : undefined));

  // Selects the raw, store-stable `findings` record (never a value that
  // changes identity on every call) and filters it in the component body
  // instead — a selector that returns a FRESH array/object on every
  // invocation breaks `useSyncExternalStore`'s snapshot-caching contract
  // (React logs "the result of getSnapshot should be cached" and can loop
  // indefinitely re-rendering) exactly as it would for any other Zustand
  // store in this app; this keeps the subscription itself stable.
  const findingsRecord = useFindingStore((state) => state.findings);
  const findings = Object.values(findingsRecord).filter((finding) =>
    missionRef.vehicleKind === "robot" ? finding.detectedByRobotMissionId === missionRef.missionId : finding.detectedByDroneMissionId === missionRef.missionId,
  );

  const [pending, setPending] = useState<"pause" | "resume" | "cancel" | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [reportExpanded, setReportExpanded] = useState(false);
  // Re-renders once a second so the elapsed-time readout keeps counting —
  // purely a display tick, never a source of mission state itself (that
  // still always comes from `mission.startedAt`/the live store above).
  const [, forceTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceTick((tick) => tick + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!mission) {
    return (
      <div className="max-w-[85%] rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5 text-sm text-foreground-subtle shadow-panel">
        This mission no longer exists.
      </div>
    );
  }

  const isRobot = missionRef.vehicleKind === "robot";
  const statusLabel = isRobot ? ROBOT_MISSION_STATUS_LABELS[robotMission!.status] : MISSION_STATUS_LABELS[droneMission!.status];
  const canPause = isRobot ? ROBOT_MISSION_ACTIVE_STATUSES.includes(robotMission!.status) : MISSION_FLIGHT_STATUSES.includes(droneMission!.status);
  const canResume = mission.status === "paused";
  const canCancel = mission.status !== "completed" && mission.status !== "cancelled";
  const isTerminal = mission.status === "completed" || mission.status === "cancelled";

  const status: Status =
    mission.status === "paused" ? "attention" : mission.status === "cancelled" ? "critical" : mission.status === "completed" ? "info" : "nominal";

  function formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);
    return `${minutes}m ${seconds}s`;
  }

  const elapsedLabel = (() => {
    if (!mission.startedAt) return null;
    const endedAt = mission.completedAt ?? Date.now();
    return formatDuration(Math.max(0, (endedAt - mission.startedAt) / 1000));
  })();

  // A real ETA derived from the mission's own real
  // estimate (never a separately-invented number): the estimate already
  // reflects this specific mission's real parameters (plot size, spacing,
  // vehicle speed — see `robot-mission-defaults.ts`/`mission-defaults.ts`),
  // so `(1 - progress) × estimated duration` is legitimate arithmetic on a
  // real value, not a fabrication. Omitted once terminal or once progress
  // has overrun the estimate (a real possibility this simulation allows) —
  // shown as "any moment now" rather than a confusing negative number.
  const etaLabel = (() => {
    if (isTerminal || !mission.estimate) return null;
    const remainingFraction = Math.max(0, 1 - mission.progressPercent / 100);
    const remainingSeconds = mission.estimate.durationMinutes * 60 * remainingFraction;
    return remainingSeconds < 1 ? "any moment now" : formatDuration(remainingSeconds);
  })();

  const missionTypeLabel = isRobot ? ROBOT_MISSION_TYPE_LABELS[robotMission!.missionType] : MISSION_TYPE_LABELS[droneMission!.missionType];

  async function runControl(action: "pause" | "resume" | "cancel") {
    setPending(action);
    try {
      const fn = action === "pause" ? pauseMissionById : action === "resume" ? resumeMissionById : cancelMissionById;
      const result = await fn(missionRef.vehicleKind, missionRef.missionId, userRole);
      appendAssistantNote(result.message);
    } finally {
      setPending(null);
      setConfirmingCancel(false);
    }
  }

  return (
    <div className="flex max-w-[85%] flex-col gap-2">
      <MissionCard
        title={mission.name}
        assetType={missionRef.vehicleKind}
        status={status}
        statusLabel={statusLabel}
        field={targetPlotLabel ? `📍 ${targetPlotLabel}` : undefined}
        eta={etaLabel ?? undefined}
        progress={mission.progressPercent}
        icon={isRobot ? <Bot /> : <PlaneTakeoff />}
        actions={
          confirmingCancel ? (
            <div className="flex w-full flex-col gap-2" role="alertdialog" aria-label="Confirm mission cancellation">
              <Typography variant="small" className="text-foreground-muted">
                Cancel this mission? The mission will stop and this action cannot be undone.
              </Typography>
              <div className="flex items-center gap-2">
                <Button intent="destructive" size="sm" loading={pending === "cancel"} onClick={() => void runControl("cancel")}>
                  Yes, cancel
                </Button>
                <Button intent="secondary" size="sm" disabled={pending === "cancel"} onClick={() => setConfirmingCancel(false)}>
                  Never mind
                </Button>
              </div>
            </div>
          ) : (
            <>
              {canPause ? (
                <Button intent="secondary" size="sm" loading={pending === "pause"} disabled={pending !== null} onClick={() => void runControl("pause")} aria-label={`Pause ${mission.name}`}>
                  Pause
                </Button>
              ) : null}
              {canResume ? (
                <Button intent="secondary" size="sm" loading={pending === "resume"} disabled={pending !== null} onClick={() => void runControl("resume")} aria-label={`Resume ${mission.name}`}>
                  Resume
                </Button>
              ) : null}
              {canCancel ? (
                <Button intent="destructive" size="sm" disabled={pending !== null} onClick={() => setConfirmingCancel(true)} aria-label={`Cancel ${mission.name}`}>
                  Cancel
                </Button>
              ) : null}
              {isTerminal ? (
                <Button intent="ghost" size="sm" onClick={() => setReportExpanded((expanded) => !expanded)} aria-expanded={reportExpanded}>
                  {reportExpanded ? "Hide Mission Report" : "View Mission Report"}
                </Button>
              ) : null}
            </>
          )
        }
      />
      {/* Elapsed time visible at a glance while a mission runs, alongside the card's own real ETA above; both derived from real mission fields, never a separate invented clock. */}
      {!isTerminal && elapsedLabel ? (
        <Typography variant="small" className="px-1 text-foreground-subtle">
          Elapsed {elapsedLabel}
        </Typography>
      ) : null}
      {/* A screen reader announces the live status/stage as it changes — the visual card above already conveys the same information via text (never color alone). */}
      <div className="sr-only" role="status" aria-live="polite">
        {mission.name} is {statusLabel}
        {assignedVehicleName ? `, assigned to ${assignedVehicleName}` : ""}.
      </div>
      {isTerminal && reportExpanded ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-elevated px-3.5 py-2.5 text-sm text-foreground-muted">
          <Typography variant="small">Mission type: {missionTypeLabel}</Typography>
          <Typography variant="small">Vehicle: {assignedVehicleName ?? "unassigned"}</Typography>
          {targetPlotLabel ? <Typography variant="small">Target: {targetPlotLabel}</Typography> : null}
          {elapsedLabel ? <Typography variant="small">Duration: {elapsedLabel}</Typography> : null}
          {mission.status === "cancelled" ? <Typography variant="small">This mission was cancelled before completion — its record remains in your mission history.</Typography> : null}
          {findings.length === 0 ? (
            <Typography variant="small">No issues were detected during this mission.</Typography>
          ) : (
            findings.map((finding) => (
              <Typography key={finding.id} variant="small">
                Finding: {CROP_ISSUE_TYPE_LABELS[finding.issueType]} ({finding.severity} severity)
              </Typography>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
