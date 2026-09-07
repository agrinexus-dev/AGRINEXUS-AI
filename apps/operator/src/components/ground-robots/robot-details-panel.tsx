"use client";

import { useState } from "react";
import { Home, LocateFixed, Pause, Pencil, Play, Sparkles, Wrench } from "lucide-react";

import {
  Badge,
  Button,
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

import { farmPlots } from "@/components/digital-twin/scene/farm-data";
import { useActionBridgeStore } from "@/lib/aura/actions/action-bridge-store";
import { COMMUNICATION_TYPE_LABELS } from "@/lib/fleet/types";
import { useRobotStore } from "@/lib/robots/robot-store";
import { ROBOT_MOVING_STATUSES, ROBOT_STATUS_LABELS, ROBOT_TYPE_LABELS } from "@/lib/robots/types";

import { AssignMissionDialog } from "./assign-mission-dialog";
import { EditRobotDialog } from "./edit-robot-dialog";

/**
 * RIGHT PANEL — Robot Details (rebuilt to match
 * `DroneDetailsPanel`'s Drawer-based convention — was a `Card` always
 * occupying a third grid column, even when nothing was selected). Same
 * `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerTitle` shell, same
 * `robotId`-in/`onClose`-out prop shape, same "select from the store live"
 * pattern (`useRobotStore` selector by id) as `DroneDetailsPanel`'s
 * `useFleetStore` selector — so this panel reflects live telemetry updates
 * exactly like the drone one does, not a snapshot taken at selection time.
 *
 * Content stays ROBOT-specific throughout (General/Telemetry/Health/Mission
 * sections, ground-robot fields like CPU/temperature/motor+wheel health) —
 * only the outer container and header treatment were aligned to Drone
 * Fleet's convention, per this change's explicit "don't blindly copy
 * drone-specific fields" instruction. The action-button grid (Locate/Send
 * Home/Pause/Resume/Assign Mission/Maintenance) is EXISTING robot
 * functionality with no drone equivalent to mirror — kept as-is, appended
 * inside the same drawer content rather than removed.
 *
 * This change adds the Edit entry point (header pencil icon) — mirrors
 * `DroneDetailsPanel`'s own addition exactly, opening `EditRobotDialog`
 * pre-filled with this robot's current identity/config, including Home
 * Position (the fix for the overlapping-(0,0)-robots bug).
 */
export function RobotDetailsPanel({ robotId, onClose }: { robotId: string | null; onClose: () => void }) {
  const robot = useRobotStore((state) => (robotId ? state.robots[robotId] : undefined));
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const canPause = robot ? ROBOT_MOVING_STATUSES.includes(robot.status) : false;
  const canResume = robot ? robot.status === "paused" || robot.status === "charging" || robot.status === "idle" : false;
  const canSendHome = robot ? robot.status !== "returning" && robot.status !== "charging" && robot.status !== "maintenance" : false;
  const inMaintenance = robot?.status === "maintenance";
  const targetPlotLabel = robot?.currentMissionTargetPlotId
    ? (farmPlots.find((plot) => plot.id === robot.currentMissionTargetPlotId)?.label ?? robot.currentMissionTargetPlotId)
    : null;

  return (
    <Drawer open={Boolean(robot)} onOpenChange={(open) => !open && onClose()} direction="right">
      <DrawerContent className="max-w-md gap-0 p-0">
        {robot ? (
          <>
            <DrawerHeader className="flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: robot.color }} aria-hidden />
                <div className="flex flex-col">
                  <DrawerTitle>{robot.name}</DrawerTitle>
                  <Typography variant="caption">{robot.model}</Typography>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton aria-label="Edit Robot" icon={<Pencil />} intent="ghost" size="sm" onClick={() => setEditOpen(true)} />
                  </TooltipTrigger>
                  <TooltipContent side="top">Edit Robot</TooltipContent>
                </Tooltip>
                <StatusBadge status={robot.health} />
              </div>
            </DrawerHeader>

            <div className="flex flex-col gap-5 overflow-y-auto p-5">
              <Section title="General">
                <Row label="Manufacturer" value={robot.manufacturer} />
                <Row label="Robot Type" value={ROBOT_TYPE_LABELS[robot.robotType]} />
                <Row label="Communication" value={COMMUNICATION_TYPE_LABELS[robot.communicationType]} />
                <Row label="Home Position" value={`X ${robot.homePosition[0].toFixed(1)}, Z ${robot.homePosition[1].toFixed(1)}`} />
                <Row label="Signal Strength" value={`${robot.signalPercent}%`} />
              </Section>

              <Divider />

              <Section title="Telemetry">
                <Row label="Status" value={<Badge intent="neutral">{ROBOT_STATUS_LABELS[robot.status]}</Badge>} />
                <Row label="Battery" value={`${robot.batteryPercent}%`} />
                <Row label="CPU" value={`${robot.cpuPercent}%`} />
                <Row label="Temperature" value={`${robot.temperatureC.toFixed(1)}°C`} />
                <Row label="Speed" value={`${robot.speedMps.toFixed(1)} m/s`} />
                <Row label="Position" value={`X ${robot.position[0].toFixed(1)}, Z ${robot.position[1].toFixed(1)}`} />
                <Row label="Estimated Runtime" value={`${robot.maxRuntimeMinutes} min`} />
              </Section>

              <Divider />

              <Section title="Health">
                <Row label="Motor Health" value={<StatusBadge status={robot.motorHealth} />} />
                <Row label="Wheel Health" value={<StatusBadge status={robot.wheelHealth} />} />
                <Row label="Maintenance Date" value={new Date(robot.maintenanceDueAt).toLocaleDateString()} />
              </Section>

              <Divider />

              <Section title="Mission">
                <Row label="Current Mission" value={robot.currentMissionLabel ?? "None"} />
                <Row label="Target" value={targetPlotLabel ?? "—"} />
              </Section>

              <Divider />

              <div className="grid grid-cols-2 gap-2">
                <Button
                  intent="secondary"
                  leadingIcon={<LocateFixed />}
                  onClick={() => useActionBridgeStore.getState().digitalTwin?.locateRobot(robot.id)}
                >
                  Locate
                </Button>
                <Button intent="secondary" leadingIcon={<Home />} disabled={!canSendHome} onClick={() => useRobotStore.getState().sendRobotHome(robot.id)}>
                  Send Home
                </Button>
                <Button intent="secondary" leadingIcon={<Pause />} disabled={!canPause} onClick={() => useRobotStore.getState().pauseRobot(robot.id)}>
                  Pause
                </Button>
                <Button intent="secondary" leadingIcon={<Play />} disabled={!canResume} onClick={() => useRobotStore.getState().resumeRobot(robot.id)}>
                  Resume
                </Button>
                <Button intent="secondary" leadingIcon={<Sparkles />} onClick={() => setAssignOpen(true)}>
                  Assign Mission
                </Button>
                <Button
                  intent={inMaintenance ? "primary" : "secondary"}
                  leadingIcon={<Wrench />}
                  onClick={() => useRobotStore.getState().setMaintenanceMode(robot.id, !inMaintenance)}
                >
                  {inMaintenance ? "Exit Maintenance" : "Maintenance Mode"}
                </Button>
              </div>
            </div>

            <AssignMissionDialog robot={robot} open={assignOpen} onOpenChange={setAssignOpen} />
            <EditRobotDialog robot={robot} open={editOpen} onOpenChange={setEditOpen} />
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
