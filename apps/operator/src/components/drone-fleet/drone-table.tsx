"use client";

import { PlaneTakeoff, Trash2 } from "lucide-react";

import { Badge, Card, EmptyState, IconButton, StatusBadge, Typography } from "@agrinexus/ui";

import { DRONE_STATUS_LABELS, DRONE_TYPE_LABELS, type DroneRecord } from "@/lib/fleet/types";

interface DroneTableProps {
  drones: DroneRecord[];
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

/** No dedicated Table component exists in the design system (confirmed) — a plain HTML table styled with the same dark-theme tokens every other component uses. */
export function DroneTable({ drones, onSelect, onRemove }: DroneTableProps) {
  if (drones.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={<PlaneTakeoff />}
          title="No drones in the fleet"
          description="Add a drone to start tracking it here, in the Digital Twin, and in AURA."
          className="border-none"
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-elevated/60">
              <th className="px-4 py-3 font-medium text-foreground-subtle">Drone</th>
              <th className="px-4 py-3 font-medium text-foreground-subtle">Type</th>
              <th className="px-4 py-3 font-medium text-foreground-subtle">Status</th>
              <th className="px-4 py-3 font-medium text-foreground-subtle">Battery</th>
              <th className="px-4 py-3 font-medium text-foreground-subtle">Health</th>
              <th className="px-4 py-3 font-medium text-foreground-subtle">Signal</th>
              <th className="px-4 py-3 font-medium text-foreground-subtle">Flight Hrs</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {drones.map((drone) => (
              <tr
                key={drone.id}
                onClick={() => onSelect(drone.id)}
                // UI-UPGRADE.3 — was `bg-white/[var(--opacity-hover)]`; see `sensor-table.tsx`'s identical fix.
                className="cursor-pointer border-b border-border-subtle transition-colors duration-(--duration-fast) ease-standard last:border-none hover:bg-foreground/[var(--opacity-hover)]"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: drone.color }} aria-hidden />
                    <div className="flex flex-col">
                      <Typography variant="body" className="font-medium">
                        {drone.name}
                      </Typography>
                      <Typography variant="caption">{drone.serialNumber}</Typography>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-foreground-muted">{DRONE_TYPE_LABELS[drone.droneType]}</td>
                <td className="px-4 py-3">
                  <Badge intent="neutral">{DRONE_STATUS_LABELS[drone.status]}</Badge>
                </td>
                <td className="px-4 py-3 font-mono text-foreground">{drone.batteryPercent}%</td>
                <td className="px-4 py-3">
                  <StatusBadge status={drone.health} />
                </td>
                <td className="px-4 py-3 text-foreground-muted">{drone.signalPercent}%</td>
                <td className="px-4 py-3 font-mono text-foreground-muted">{drone.flightHours.toFixed(1)}</td>
                <td className="px-4 py-3">
                  <IconButton
                    aria-label={`Remove ${drone.name}`}
                    intent="ghost"
                    size="sm"
                    icon={<Trash2 />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(drone.id);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
