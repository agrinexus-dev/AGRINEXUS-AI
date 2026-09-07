"use client";

import { Battery, Clock, PlaneTakeoff } from "lucide-react";

import { Card, StatusBadge, Typography, type Status } from "@agrinexus/ui";

import { useFleetStore } from "@/lib/fleet/fleet-store";
import { MISSION_STATUS_LABELS, MISSION_TYPE_LABELS, type MissionRecord, type MissionStatus } from "@/lib/missions/types";

const MISSION_STATUS_BADGE: Record<MissionStatus, Status> = {
  queued: "info",
  preparing: "nominal",
  "taking-off": "nominal",
  surveying: "nominal",
  returning: "nominal",
  landing: "nominal",
  completed: "nominal",
  paused: "attention",
  cancelled: "offline",
};

function formatEta(mission: MissionRecord): string {
  if (!mission.estimate) return "—";
  if (mission.status === "completed" || mission.status === "cancelled") return "—";
  const remainingMinutes = mission.estimate.durationMinutes * (1 - mission.progressPercent / 100);
  return `${Math.max(0, remainingMinutes).toFixed(1)} min`;
}

export function MissionLibraryCard({ mission, selected, onSelect }: { mission: MissionRecord; selected: boolean; onSelect: () => void }) {
  const droneName = useFleetStore((state) => (mission.assignedDroneId ? (state.drones[mission.assignedDroneId]?.name ?? null) : null));

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      // UI-UPGRADE.3 — was `bg-white/[var(--opacity-hover)]`; see `sensor-table.tsx`'s identical fix.
      className={`flex cursor-pointer flex-col gap-2 p-3 outline-none transition-colors duration-(--duration-fast) ease-standard hover:bg-foreground/[var(--opacity-hover)] ${selected ? "border-accent" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <Typography variant="small" className="font-medium text-foreground">
            {mission.name}
          </Typography>
          <Typography variant="caption">{MISSION_TYPE_LABELS[mission.missionType]}</Typography>
        </div>
        <StatusBadge status={MISSION_STATUS_BADGE[mission.status]} label={MISSION_STATUS_LABELS[mission.status]} />
      </div>

      <div className="flex items-center gap-1.5 text-foreground-muted">
        <PlaneTakeoff className="size-3.5" aria-hidden />
        <Typography variant="caption">{droneName ?? "Unassigned"}</Typography>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-(--duration-slow) ease-standard"
          style={{ width: `${Math.min(100, Math.max(0, mission.progressPercent))}%` }}
          role="progressbar"
          aria-valuenow={mission.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      <div className="flex items-center justify-between text-foreground-subtle">
        <span className="flex items-center gap-1 text-xs">
          <Battery className="size-3.5" aria-hidden />
          {mission.estimate ? `Est. ${mission.estimate.batteryPercent}%` : "—"}
        </span>
        <span className="flex items-center gap-1 text-xs">
          <Clock className="size-3.5" aria-hidden />
          {formatEta(mission)}
        </span>
      </div>
    </Card>
  );
}
