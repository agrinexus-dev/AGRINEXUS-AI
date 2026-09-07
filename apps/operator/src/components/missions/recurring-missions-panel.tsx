"use client";

import { useState } from "react";
import { Bot, Plus, Repeat, Trash2 } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Typography,
} from "@agrinexus/ui";

import { RobotCapabilityBreakdown } from "@/components/robot-missions/robot-capability-breakdown";
import { useFleetDrones } from "@/lib/fleet/fleet-store";
import type { MissionType } from "@/lib/missions/types";
import { usePlots } from "@/lib/plots/plot-store";
import { useRecurringMissions, useRecurringMissionStore } from "@/lib/recurring-missions/recurring-mission-store";
import type { RecurringVehicleKind } from "@/lib/recurring-missions/types";
import { getRobotMissionCapability, ROBOT_MISSION_CAPABILITIES } from "@/lib/robot-missions/robot-mission-capabilities";
import type { RobotMissionType } from "@/lib/robot-missions/types";
import { useRobots } from "@/lib/robots/robot-store";

/**
 * A CURATED subset of the full `MissionType`/
 * `RobotMissionType` enums, not the raw list. Every option here is a REAL,
 * already-supported value (no new mission types invented, no schema
 * change) — curation only changes what this ONE picker offers and how it's
 * labeled; the regular one-time Mission Inspector still offers the full
 * type list unchanged.
 *
 * Drone types: the underlying scan (`scanForIssues`, `lib/findings/`)
 * looks for the SAME set of possible crop issues regardless of which
 * `MissionType` is picked — there's no per-type detection filter in the
 * simulation today, so "type" here is genuinely about giving the operator
 * a meaningful, honestly-labeled intent, not a claim that e.g. "Irrigation
 * Inspection" only ever finds irrigation problems.
 */
const DRONE_RECURRING_TYPES: { type: MissionType; label: string; description: string }[] = [
  { type: "crop-health", label: "Crop Health Inspection", description: "General crop condition scan of the target plot." },
  { type: "disease-scan", label: "Crop Issue Detection", description: "Scans for and reports any detectable crop issue." },
  { type: "irrigation-inspection", label: "Irrigation / Water Stress Inspection", description: "Focused on dry-soil and standing-water conditions." },
  { type: "emergency-inspection", label: "Pest / Fungal Risk Inspection", description: "Focused on pest activity and fungal risk conditions." },
  { type: "survey", label: "General Field Survey", description: "Broad coverage pass over the whole plot." },
];

/**
 * Robot types — now sourced from the canonical
 * `ROBOT_MISSION_CAPABILITIES` (`lib/robot-missions/robot-mission-
 * capabilities.ts`) instead of a local copy (the array that file was
 * extracted from) — the same list also drives the one-time
 * Create Robot Mission dialog and the robot mission simulation's own issue
 * generation, so all three stay a single source of truth for "which issue
 * types can this mission type actually resolve."
 */
const ROBOT_RECURRING_TYPES = ROBOT_MISSION_CAPABILITIES;

/**
 * Recurring Missions panel — added to the EXISTING Mission Library
 * sidebar (both drone and
 * robot planners render this same component, told apart only by
 * `vehicleKind`) rather than a new page/dialog primitive. Every action
 * here calls the SAME `useRecurringMissionStore` actions the scheduler
 * itself reads from — this panel is purely a view onto that store, not a
 * second source of truth.
 */
export function RecurringMissionsPanel({ vehicleKind }: { vehicleKind: RecurringVehicleKind }) {
  const allConfigs = useRecurringMissions();
  const configs = allConfigs.filter((config) => config.vehicleKind === vehicleKind);
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Typography variant="caption" className="flex items-center gap-1.5 text-foreground-subtle">
          <Repeat className="size-3.5" aria-hidden />
          Recurring {vehicleKind === "drone" ? "Drone" : "Robot"} Missions
        </Typography>
        <Button intent="primary" size="sm" leadingIcon={<Plus className="size-3.5" />} onClick={() => setFormOpen((open) => !open)}>
          New Recurring Mission
        </Button>
      </div>

      {formOpen ? <NewRecurringMissionForm vehicleKind={vehicleKind} onDone={() => setFormOpen(false)} /> : null}

      {configs.length === 0 ? (
        <EmptyState
          icon={<Repeat />}
          title="No recurring missions"
          description={`Create one above to have a ${vehicleKind} automatically run on a schedule. Each run appears in the library above like any other mission.`}
          className="py-6"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {configs.map((config) => (
            <RecurringMissionRow key={config.id} configId={config.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatNextRun(nextRunAt: number | null, activeRunId: string | null): string {
  if (activeRunId) return "Running now";
  if (nextRunAt === null) return "Paused";
  const diffMinutes = Math.round((nextRunAt - Date.now()) / 60000);
  if (diffMinutes <= 0) return "Due now";
  if (diffMinutes < 60) return `Next in ${diffMinutes} min`;
  return `Next in ${Math.round(diffMinutes / 60)} hr`;
}

function RecurringMissionRow({ configId }: { configId: string }) {
  const config = useRecurringMissionStore((state) => state.configs[configId]);
  const plots = usePlots();
  if (!config) return null;
  const plot = plots.find((candidate) => candidate.id === config.targetPlotId);
  const typeLabel =
    config.vehicleKind === "drone"
      ? (DRONE_RECURRING_TYPES.find((entry) => entry.type === config.droneMissionType)?.label ?? config.droneMissionType)
      : (ROBOT_RECURRING_TYPES.find((entry) => entry.type === config.robotMissionType)?.label ?? config.robotMissionType);

  return (
    <Card className="flex flex-col gap-1.5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <Typography variant="small" className="font-medium text-foreground">
            {config.name}
          </Typography>
          <Typography variant="caption" className="text-foreground-subtle">
            {typeLabel} · {plot?.label ?? "No plot"} · every {config.intervalMinutes} min
          </Typography>
        </div>
        <Switch checked={config.enabled} onCheckedChange={(checked) => useRecurringMissionStore.getState().setEnabled(configId, checked)} aria-label="Enable recurring mission" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Badge intent={config.activeRunId ? "success" : config.enabled ? "neutral" : "outline"}>{formatNextRun(config.nextRunAt, config.activeRunId)}</Badge>
        <Button intent="outline" size="sm" leadingIcon={<Trash2 className="size-3.5" />} onClick={() => useRecurringMissionStore.getState().deleteRecurringMission(configId)}>
          Delete
        </Button>
      </div>
    </Card>
  );
}

function NewRecurringMissionForm({ vehicleKind, onDone }: { vehicleKind: RecurringVehicleKind; onDone: () => void }) {
  const plots = usePlots();
  const drones = useFleetDrones();
  const robots = useRobots();

  const [plotId, setPlotId] = useState<string>(plots[0]?.id ?? "");
  const [vehicleId, setVehicleId] = useState<string>((vehicleKind === "drone" ? drones[0]?.id : robots[0]?.id) ?? "");
  const [droneMissionType, setDroneMissionType] = useState<MissionType>(DRONE_RECURRING_TYPES[0]!.type);
  const [robotMissionType, setRobotMissionType] = useState<RobotMissionType>(ROBOT_RECURRING_TYPES[0]!.type);
  const [intervalMinutes, setIntervalMinutes] = useState(10);

  const vehicleOptions = vehicleKind === "drone" ? drones : robots;
  const canCreate = plotId !== "" && vehicleId !== "" && intervalMinutes >= 1;
  const selectedTypeDescription =
    vehicleKind === "drone"
      ? DRONE_RECURRING_TYPES.find((entry) => entry.type === droneMissionType)?.description
      : ROBOT_RECURRING_TYPES.find((entry) => entry.type === robotMissionType)?.description;

  function handleCreate() {
    if (!canCreate) return;
    const plot = plots.find((candidate) => candidate.id === plotId);
    const name = `${plot?.label ?? "Plot"} ${
      vehicleKind === "drone" ? DRONE_RECURRING_TYPES.find((e) => e.type === droneMissionType)!.label : ROBOT_RECURRING_TYPES.find((e) => e.type === robotMissionType)!.label
    }`;
    useRecurringMissionStore.getState().createRecurringMission({
      name,
      vehicleKind,
      targetPlotId: plotId,
      droneMissionType: vehicleKind === "drone" ? droneMissionType : null,
      robotMissionType: vehicleKind === "robot" ? robotMissionType : null,
      assignedDroneId: vehicleKind === "drone" ? vehicleId : null,
      assignedRobotId: vehicleKind === "robot" ? vehicleId : null,
      intervalMinutes,
    });
    onDone();
  }

  return (
    <Card className="flex flex-col gap-2.5 p-3">
      {/* Part 4 — "Vehicle type" is the Mission Planner page itself (this
          panel only ever renders inside the Drone or the Robot planner,
          exactly like the regular one-time mission form already works) —
          stated explicitly here so it's never ambiguous which fleet this
          schedule targets. */}
      <div className="flex items-center gap-1.5 text-foreground-subtle">
        <Bot className="size-3.5" aria-hidden />
        <Typography variant="caption">Vehicle type: {vehicleKind === "drone" ? "Drone" : "Ground Robot"}</Typography>
      </div>

      <Select value={plotId} onValueChange={setPlotId}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Target plot" />
        </SelectTrigger>
        <SelectContent>
          {plots.map((plot) => (
            <SelectItem key={plot.id} value={plot.id}>
              {plot.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={vehicleId} onValueChange={setVehicleId}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={vehicleKind === "drone" ? "Drone" : "Robot"} />
        </SelectTrigger>
        <SelectContent>
          {vehicleOptions.map((vehicle) => (
            <SelectItem key={vehicle.id} value={vehicle.id}>
              {vehicle.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {vehicleKind === "drone" ? (
        <Select value={droneMissionType} onValueChange={(value) => setDroneMissionType(value as MissionType)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DRONE_RECURRING_TYPES.map((entry) => (
              <SelectItem key={entry.type} value={entry.type}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Select value={robotMissionType} onValueChange={(value) => setRobotMissionType(value as RobotMissionType)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROBOT_RECURRING_TYPES.map((entry) => (
              <SelectItem key={entry.type} value={entry.type}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {vehicleKind === "robot" ? (
        // The explicit Detects/Can Resolve/Robot Action
        // breakdown, so the operator sees exactly what this mission type
        // can find and fix before scheduling it, not just a one-line
        // description. Drones keep the plain caption below (no per-type
        // detection filter exists for drones — see this file's own
        // DRONE_RECURRING_TYPES doc comment).
        (() => {
          const capability = getRobotMissionCapability(robotMissionType);
          return capability ? <RobotCapabilityBreakdown capability={capability} /> : null;
        })()
      ) : selectedTypeDescription ? (
        <Typography variant="caption" className="text-foreground-subtle">
          {selectedTypeDescription}
        </Typography>
      ) : null}

      <div className="flex items-center gap-2">
        <Typography variant="caption" className="shrink-0 text-foreground-subtle">
          Every
        </Typography>
        <Input
          type="number"
          min={1}
          max={1440}
          value={intervalMinutes}
          onChange={(event) => setIntervalMinutes(Math.max(1, Number(event.target.value) || 1))}
          className="w-20"
        />
        <Typography variant="caption" className="text-foreground-subtle">
          minutes
        </Typography>
      </div>

      <Button intent="primary" size="sm" disabled={!canCreate} onClick={handleCreate}>
        Create Recurring Mission
      </Button>
    </Card>
  );
}
