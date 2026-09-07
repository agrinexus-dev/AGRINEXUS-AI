"use client";

import { Bot as BotIcon, Eye, Home, LocateFixed, Pause, Play, Trash2, Wrench } from "lucide-react";

import { Badge, Card, EmptyState, IconButton, StatusBadge, Tooltip, TooltipContent, TooltipTrigger, Typography } from "@agrinexus/ui";

import { useActionBridgeStore } from "@/lib/aura/actions/action-bridge-store";
import { useRobotStore } from "@/lib/robots/robot-store";
import { ROBOT_MOVING_STATUSES, ROBOT_STATUS_LABELS, type RobotRecord } from "@/lib/robots/types";

interface RobotTableProps {
  robots: RobotRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Mirrors `DroneTable`'s `onRemove`; wired to the same real, persisted `removeRobot` round-trip `DroneTable`'s delete button already uses (via `removeDrone`). */
  onRemove: (id: string) => void;
}

function formatLastActivity(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function formatEta(robot: RobotRecord): string {
  if (robot.status !== "returning" || robot.returningEtaAt === null) return "—";
  const remainingSeconds = Math.max(0, Math.round((robot.returningEtaAt - Date.now()) / 1000));
  return remainingSeconds < 60 ? `${remainingSeconds}s` : `${Math.ceil(remainingSeconds / 60)}m`;
}

/**
 * CENTER PANEL — Robot Table. No dedicated Table component
 * exists in the design system (same finding `DroneTable` already
 * documents) — a plain HTML table styled with the same dark-theme tokens,
 * horizontally scrollable so the full 12-column spec fits without forcing
 * this whole page into the Digital Twin's full-bleed treatment.
 */
export function RobotTable({ robots, selectedId, onSelect, onRemove }: RobotTableProps) {
  if (robots.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={<BotIcon />}
          title="No robots in the fleet"
          description="Add a robot to start tracking it here, in the Digital Twin, and in AURA."
          className="border-none"
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-elevated/60">
              <th className="px-3 py-3 font-medium text-foreground-subtle">Robot</th>
              <th className="px-3 py-3 font-medium text-foreground-subtle">Model</th>
              <th className="px-3 py-3 font-medium text-foreground-subtle">Status</th>
              <th className="px-3 py-3 font-medium text-foreground-subtle">Mission</th>
              <th className="px-3 py-3 font-medium text-foreground-subtle">Battery</th>
              <th className="px-3 py-3 font-medium text-foreground-subtle">Speed</th>
              <th className="px-3 py-3 font-medium text-foreground-subtle">Health</th>
              <th className="px-3 py-3 font-medium text-foreground-subtle">Connection</th>
              <th className="px-3 py-3 font-medium text-foreground-subtle">Location</th>
              <th className="px-3 py-3 font-medium text-foreground-subtle">Last Activity</th>
              <th className="px-3 py-3 font-medium text-foreground-subtle">ETA</th>
              <th className="px-3 py-3 font-medium text-foreground-subtle">Actions</th>
            </tr>
          </thead>
          <tbody>
            {robots.map((robot) => (
              <RobotRow key={robot.id} robot={robot} selected={robot.id === selectedId} onSelect={onSelect} onRemove={onRemove} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RobotRow({
  robot,
  selected,
  onSelect,
  onRemove,
}: {
  robot: RobotRecord;
  selected: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const canPause = ROBOT_MOVING_STATUSES.includes(robot.status);
  const canResume = robot.status === "paused" || robot.status === "charging" || robot.status === "idle";
  const canSendHome = robot.status !== "returning" && robot.status !== "charging" && robot.status !== "maintenance";
  const inMaintenance = robot.status === "maintenance";

  function handleLocate() {
    onSelect(robot.id);
    // Best-effort: only succeeds if the Digital Twin page happens to be the
    // one currently mounted (its bridge registration — see
    // `action-bridge-store.ts`). This page never embeds the 3D viewport
    // itself (spec: Robot Table is a data table, not a second Scene), so
    // selecting the robot here (for the Right Panel) is the always-working
    // half of "Locate"; camera follow is a bonus when it's available.
    useActionBridgeStore.getState().digitalTwin?.locateRobot(robot.id);
  }

  return (
    <tr
      onClick={() => onSelect(robot.id)}
      // UI-UPGRADE.3 — was `bg-white/[var(--opacity-hover)]`; see
      // `sensor-table.tsx`'s identical fix.
      className={`cursor-pointer border-b border-border-subtle transition-colors duration-(--duration-fast) ease-standard last:border-none hover:bg-foreground/[var(--opacity-hover)] ${
        selected ? "bg-foreground/[var(--opacity-hover)]" : ""
      }`}
    >
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: robot.color }} aria-hidden />
          <Typography variant="body" className="font-medium">
            {robot.name}
          </Typography>
        </div>
      </td>
      <td className="px-3 py-3 text-foreground-muted">{robot.model}</td>
      <td className="px-3 py-3">
        <Badge intent="neutral">{ROBOT_STATUS_LABELS[robot.status]}</Badge>
      </td>
      <td className="px-3 py-3 text-foreground-muted">{robot.currentMissionLabel ?? "—"}</td>
      <td className="px-3 py-3 font-mono text-foreground">{robot.batteryPercent}%</td>
      <td className="px-3 py-3 font-mono text-foreground-muted">{robot.speedMps.toFixed(1)} m/s</td>
      <td className="px-3 py-3">
        <StatusBadge status={robot.health} />
      </td>
      <td className="px-3 py-3 text-foreground-muted">{robot.connectionQuality}</td>
      <td className="px-3 py-3 font-mono text-foreground-muted">
        x={robot.position[0].toFixed(1)}, z={robot.position[1].toFixed(1)}
      </td>
      {/* `formatLastActivity` is `Date.now()`-relative, so it can legitimately
          differ between the server render and the client's first hydration
          pass — same class of mismatch `SensorTable`'s own "Last Updated"
          cell already documents (see that file), here made slightly more
          pronounced by `useRobotSimulation`'s mount-effect `tick()`, which
          calls `updateRobotTelemetry` (and therefore bumps `lastActivityAt`
          to `Date.now()`) once immediately on mount for any robot whose
          battery is actively draining/charging — client-only, so SSR never
          sees it. The resulting "Just now" is still an honest value (the
          robot's telemetry genuinely was just touched), not a wrong one;
          `suppressHydrationWarning` silences the console warning for this
          one text node without disabling hydration-mismatch detection
          anywhere else, and without changing what `lastActivityAt` means or
          touching the simulation itself. */}
      <td className="px-3 py-3 text-foreground-muted" suppressHydrationWarning>
        {formatLastActivity(robot.lastActivityAt)}
      </td>
      <td className="px-3 py-3 text-foreground-muted">{formatEta(robot)}</td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
          <RowAction label="View" icon={<Eye />} onClick={() => onSelect(robot.id)} />
          <RowAction label="Locate" icon={<LocateFixed />} onClick={handleLocate} />
          <RowAction
            label="Pause"
            icon={<Pause />}
            disabled={!canPause}
            onClick={() => useRobotStore.getState().pauseRobot(robot.id)}
          />
          <RowAction
            label="Resume"
            icon={<Play />}
            disabled={!canResume}
            onClick={() => useRobotStore.getState().resumeRobot(robot.id)}
          />
          <RowAction
            label="Send Home"
            icon={<Home />}
            disabled={!canSendHome}
            onClick={() => useRobotStore.getState().sendRobotHome(robot.id)}
          />
          <RowAction
            label={inMaintenance ? "Exit Maintenance" : "Maintenance"}
            icon={<Wrench />}
            active={inMaintenance}
            onClick={() => useRobotStore.getState().setMaintenanceMode(robot.id, !inMaintenance)}
          />
          <RowAction label={`Remove ${robot.name}`} icon={<Trash2 />} onClick={() => onRemove(robot.id)} />
        </div>
      </td>
    </tr>
  );
}

function RowAction({
  label,
  icon,
  onClick,
  disabled,
  active,
}: {
  label: string;
  icon: React.ReactElement;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          aria-label={label}
          icon={icon}
          intent={active ? "primary" : "ghost"}
          size="sm"
          disabled={disabled}
          onClick={onClick}
        />
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
