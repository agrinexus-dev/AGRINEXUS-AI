"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, LocateFixed, RadioTower, RotateCcw, Trash2, Wrench } from "lucide-react";

import {
  Badge,
  Card,
  EmptyState,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Typography,
} from "@agrinexus/ui";

import { locateSensorInDigitalTwin } from "@/lib/aura/actions/action-bridge-store";
import { sensorPlotLabel, useSensorStore } from "@/lib/sensors/sensor-store";
import { formatSensorReading, SENSOR_STATUS_LABELS, SENSOR_TYPE_LABELS, type SensorHealth, type SensorRecord, type SensorStatus } from "@/lib/sensors/types";

type SortKey = "name" | "status" | "battery" | "signal" | "reading" | "lastUpdated" | "health";
type SortDirection = "asc" | "desc";

const STATUS_FILTER_OPTIONS: (SensorStatus | "all")[] = ["all", "online", "offline", "warning", "critical", "maintenance"];

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

const HEALTH_ORDER: Record<SensorHealth, number> = { critical: 0, attention: 1, nominal: 2 };

interface SensorTableProps {
  sensors: SensorRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * CENTER PANEL — Sensor Table. No dedicated Table component
 * exists in the design system (same finding `DroneTable`/`RobotTable`
 * already document) — a plain HTML table, extended here with local
 * search/sort/filter state (this table is the first one in the app that
 * needs it — Drone/Robot fleets never grew large enough to require it).
 */
export function SensorTable({ sensors, selectedId, onSelect }: SensorTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SensorStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return sensors.filter((sensor) => {
      if (statusFilter !== "all" && sensor.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        sensor.name.toLowerCase().includes(needle) ||
        sensor.serialNumber.toLowerCase().includes(needle) ||
        SENSOR_TYPE_LABELS[sensor.sensorType].toLowerCase().includes(needle)
      );
    });
  }, [sensors, search, statusFilter]);

  const sorted = useMemo(() => {
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "status":
          return a.status.localeCompare(b.status) * factor;
        case "battery":
          return (a.batteryPercent - b.batteryPercent) * factor;
        case "signal":
          return (a.signalPercent - b.signalPercent) * factor;
        case "reading":
          return (a.currentReading - b.currentReading) * factor;
        case "lastUpdated":
          return (a.lastUpdatedAt - b.lastUpdatedAt) * factor;
        case "health":
          return (HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]) * factor;
        case "name":
        default:
          return a.name.localeCompare(b.name) * factor;
      }
    });
  }, [filtered, sortKey, sortDirection]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle p-3">
        <Input
          placeholder="Search sensors by name, serial, or type…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as SensorStatus | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {status === "all" ? "All Statuses" : SENSOR_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Typography variant="caption" className="ml-auto text-foreground-subtle">
          {sorted.length} of {sensors.length} sensors
        </Typography>
      </div>

      {sensors.length === 0 ? (
        <EmptyState
          icon={<RadioTower />}
          title="No sensors in the network"
          description="Add a sensor to start tracking it here, in the Digital Twin, and in AURA."
          className="border-none"
        />
      ) : sorted.length === 0 ? (
        <EmptyState icon={<RadioTower />} title="No sensors match your search/filter" className="border-none" />
      ) : (
        <div className="overflow-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-elevated/60">
                <SortableHeader label="Sensor" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                <th className="px-3 py-3 font-medium text-foreground-subtle">Type</th>
                <SortableHeader label="Status" sortKey="status" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                <SortableHeader label="Battery" sortKey="battery" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                <SortableHeader label="Signal" sortKey="signal" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                <SortableHeader label="Current Reading" sortKey="reading" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                <th className="px-3 py-3 font-medium text-foreground-subtle">Last Reading</th>
                <th className="px-3 py-3 font-medium text-foreground-subtle">Location</th>
                <SortableHeader label="Last Updated" sortKey="lastUpdated" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                <SortableHeader label="Health" sortKey="health" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
                <th className="px-3 py-3 font-medium text-foreground-subtle">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((sensor) => (
                <SensorRow key={sensor.id} sensor={sensor} selected={sensor.id === selectedId} onSelect={onSelect} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className="px-3 py-3 font-medium text-foreground-subtle">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 text-foreground-subtle transition-colors hover:text-foreground"
      >
        {label}
        <Icon className="size-3.5" aria-hidden />
      </button>
    </th>
  );
}

function SensorRow({ sensor, selected, onSelect }: { sensor: SensorRecord; selected: boolean; onSelect: (id: string) => void }) {
  const inMaintenance = sensor.status === "maintenance";
  const plotLabel = sensorPlotLabel(sensor);

  return (
    <tr
      onClick={() => onSelect(sensor.id)}
      // UI-UPGRADE.3 — was `bg-white/[var(--opacity-hover)]`; mixing toward
      // `--color-foreground` instead self-corrects per theme (see
      // Button.tsx's identical UI-UPGRADE.2 fix for the full reasoning).
      className={`cursor-pointer border-b border-border-subtle transition-colors duration-(--duration-fast) ease-standard last:border-none hover:bg-foreground/[var(--opacity-hover)] ${
        selected ? "bg-foreground/[var(--opacity-hover)]" : ""
      }`}
    >
      <td className="px-3 py-3">
        <Typography variant="body" className="font-medium">
          {sensor.name}
        </Typography>
        <Typography variant="caption">{sensor.serialNumber}</Typography>
      </td>
      <td className="px-3 py-3 text-foreground-muted">{SENSOR_TYPE_LABELS[sensor.sensorType]}</td>
      <td className="px-3 py-3">
        <Badge intent="neutral">{SENSOR_STATUS_LABELS[sensor.status]}</Badge>
      </td>
      <td className="px-3 py-3 font-mono text-foreground">{sensor.batteryPercent}%</td>
      <td className="px-3 py-3 font-mono text-foreground-muted">{sensor.signalPercent}%</td>
      <td className="px-3 py-3 font-mono text-foreground">{formatSensorReading(sensor)}</td>
      <td className="px-3 py-3 font-mono text-foreground-muted">{sensor.previousReading.toFixed(1)}</td>
      <td className="px-3 py-3 text-foreground-muted">{plotLabel ?? `x=${sensor.position[0].toFixed(1)}, z=${sensor.position[1].toFixed(1)}`}</td>
      {/* `formatRelativeTime` is `Date.now()`-relative, so the server-rendered
          string and the client's first-hydration string legitimately differ
          by however long the page took to reach the browser — a real but
          harmless hydration mismatch (React just keeps the fresher client
          value, which is what we want here anyway). `suppressHydrationWarning`
          silences the console warning for this one text node without
          disabling hydration-mismatch detection anywhere else. */}
      <td className="px-3 py-3 text-foreground-muted" suppressHydrationWarning>
        {formatRelativeTime(sensor.lastUpdatedAt)}
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={sensor.health} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
          <RowAction label="View" icon={<Eye />} onClick={() => onSelect(sensor.id)} />
          <RowAction
            label="Locate"
            icon={<LocateFixed />}
            onClick={() => {
              onSelect(sensor.id);
              locateSensorInDigitalTwin(sensor.id);
            }}
          />
          <RowAction label="Restart" icon={<RotateCcw />} onClick={() => useSensorStore.getState().restartSensor(sensor.id)} />
          <RowAction
            label={inMaintenance ? "Exit Maintenance" : "Maintenance"}
            icon={<Wrench />}
            active={inMaintenance}
            onClick={() => useSensorStore.getState().setMaintenanceMode(sensor.id, !inMaintenance)}
          />
          <RowAction label="Remove" icon={<Trash2 />} onClick={() => useSensorStore.getState().removeSensor(sensor.id)} />
        </div>
      </td>
    </tr>
  );
}

function RowAction({
  label,
  icon,
  onClick,
  active,
}: {
  label: string;
  icon: React.ReactElement;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton aria-label={label} icon={icon} intent={active ? "primary" : "ghost"} size="sm" onClick={onClick} />
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
