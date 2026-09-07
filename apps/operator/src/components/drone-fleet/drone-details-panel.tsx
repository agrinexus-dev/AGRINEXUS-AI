"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import {
  Badge,
  Divider,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  IconButton,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Typography,
} from "@agrinexus/ui";

import { useFleetStore } from "@/lib/fleet/fleet-store";
import {
  CAMERA_TYPE_LABELS,
  COMMUNICATION_TYPE_LABELS,
  DRONE_STATUS_LABELS,
  DRONE_TYPE_LABELS,
} from "@/lib/fleet/types";

import { EditDroneDialog } from "./edit-drone-dialog";

/**
 * The rich, per-drone details view — lives only on the
 * Drone Fleet page. The Digital Twin's own compact `DetailsPanel` stays
 * exactly as it was, so this is an additive surface, not a redesign
 * of that existing panel.
 *
 * This change adds the Edit entry point (header pencil icon), opening
 * `EditDroneDialog` pre-filled with this drone's current identity/config,
 * including Home Location — mirrors `RobotDetailsPanel`'s own addition.
 */
export function DroneDetailsPanel({ droneId, onClose }: { droneId: string | null; onClose: () => void }) {
  const drone = useFleetStore((state) => (droneId ? state.drones[droneId] : undefined));
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Drawer open={Boolean(drone)} onOpenChange={(open) => !open && onClose()} direction="right">
      <DrawerContent className="max-w-md gap-0 p-0">
        {drone ? (
          <>
            <DrawerHeader className="flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: drone.color }} aria-hidden />
                <div className="flex flex-col">
                  <DrawerTitle>{drone.name}</DrawerTitle>
                  <Typography variant="caption">{drone.model}</Typography>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton aria-label="Edit Drone" icon={<Pencil />} intent="ghost" size="sm" onClick={() => setEditOpen(true)} />
                  </TooltipTrigger>
                  <TooltipContent side="top">Edit Drone</TooltipContent>
                </Tooltip>
                <StatusBadge status={drone.health} />
              </div>
            </DrawerHeader>

            <div className="flex flex-col gap-5 overflow-y-auto p-5">
              <Section title="General Information">
                <Row label="Serial Number" value={drone.serialNumber} />
                <Row label="Drone Type" value={DRONE_TYPE_LABELS[drone.droneType]} />
                <Row label="Communication Type" value={COMMUNICATION_TYPE_LABELS[drone.communicationType]} />
                <Row label="Home Location" value={`X ${drone.homeLocation[0].toFixed(1)}, Z ${drone.homeLocation[1].toFixed(1)}`} />
                {drone.notes ? <Row label="Notes" value={drone.notes} /> : null}
              </Section>

              <Divider />

              <Section title="Battery">
                <Row label="Current Charge" value={`${drone.batteryPercent}%`} />
                <Row label="Capacity" value={`${drone.batteryCapacityMah} mAh`} />
                <Row label="Max Flight Time" value={`${drone.maxFlightTimeMinutes} min`} />
              </Section>

              <Divider />

              <Section title="Telemetry">
                <Row label="Status" value={<Badge intent="neutral">{DRONE_STATUS_LABELS[drone.status]}</Badge>} />
                <Row label="Speed" value={`${drone.speedMps.toFixed(1)} m/s`} />
                <Row label="Altitude" value={`${drone.altitude.toFixed(1)} m`} />
                <Row label="Position" value={`X ${drone.position[0].toFixed(1)}, Z ${drone.position[1].toFixed(1)}`} />
              </Section>

              <Divider />

              <Section title="Mission">
                <Row label="Current Waypoint" value={drone.currentWaypointLabel} />
                <Row label="Route" value={drone.route.label} />
                <Row label="Waypoints" value={String(drone.route.waypoints.length)} />
              </Section>

              <Divider />

              <Section title="Maintenance">
                <Row label="Health" value={<StatusBadge status={drone.health} />} />
                <Row label="Storage Used" value={`${drone.storageUsedPercent}%`} />
                <Row label="Flight Hours" value={drone.flightHours.toFixed(1)} />
              </Section>

              <Divider />

              <Section title="Camera">
                <Row label="Camera Type" value={CAMERA_TYPE_LABELS[drone.cameraType]} />
              </Section>

              <Divider />

              <Section title="Firmware & Signal">
                <Row label="Firmware Version" value={drone.firmwareVersion} />
                <Row label="Signal Strength" value={`${drone.signalPercent}%`} />
              </Section>
            </div>

            <EditDroneDialog drone={drone} open={editOpen} onOpenChange={setEditOpen} />
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Typography variant="caption">{title}</Typography>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Typography variant="small">{label}</Typography>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
