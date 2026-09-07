"use client";

import { useCallback, useRef, useState } from "react";
import { MapPin } from "lucide-react";

import { Panel, Typography } from "@agrinexus/ui";

import type { CameraRigHandle } from "@/components/digital-twin/scene/camera-rig";
import { farmPlots, type FarmPlotDefinition } from "@/components/digital-twin/scene/farm-data";
import { Scene } from "@/components/digital-twin/scene/scene";
import { DEFAULT_LAYER_VISIBILITY, type SelectableEntity } from "@/components/digital-twin/types";
import { useFleetDroneRenderConfigs } from "@/lib/fleet/fleet-store";
import { useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";
import { useRobotRenderConfigs } from "@/lib/robots/robot-store";

import { CreateRobotMissionDialog } from "./create-robot-mission-dialog";

const NOOP_DRONE_REF = () => {};
const NOOP_ROBOT_REF = () => {};

/**
 * The "CENTER PANEL — Mission Planner" — the exact same
 * `Scene` the full `/digital-twin` page renders, reused (not duplicated),
 * mirroring `MissionPlannerViewport` (drones) exactly. Stays fully
 * interactive (orbit/pan/zoom, click-to-select) so clicking a plot can drive
 * "Select Plot → Create Robot Mission" — no Google Maps/Leaflet/Mapbox, no
 * second coordinate system.
 */
export function RobotMissionPlannerViewport() {
  const cameraRigRef = useRef<CameraRigHandle>(null);
  const fleetDrones = useFleetDroneRenderConfigs();
  const fleetRobots = useRobotRenderConfigs();
  const [selected, setSelected] = useState<SelectableEntity | null>(null);
  const [pendingPlot, setPendingPlot] = useState<FarmPlotDefinition | null>(null);

  const handleSelect = useCallback((entity: SelectableEntity) => {
    setSelected(entity);
    if (entity.type === "field") {
      setPendingPlot(farmPlots.find((plot) => plot.id === entity.id) ?? null);
    }
  }, []);

  const handleDeselect = useCallback(() => setSelected(null), []);

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-lg border border-border bg-surface">
      <Scene
        ref={cameraRigRef}
        layers={DEFAULT_LAYER_VISIBILITY}
        selectedId={selected?.id ?? null}
        onSelect={handleSelect}
        onDeselect={handleDeselect}
        drones={fleetDrones}
        onDroneRef={NOOP_DRONE_REF}
        robots={fleetRobots}
        onRobotRef={NOOP_ROBOT_REF}
      />

      <div className="pointer-events-none absolute top-3 left-3 z-10">
        <Panel variant="glass" padding="sm" className="pointer-events-auto flex items-center gap-2">
          <MapPin className="size-4 text-foreground-muted" aria-hidden />
          <Typography variant="caption">Click a plot to create a robot mission</Typography>
        </Panel>
      </div>

      <CreateRobotMissionDialog
        plot={pendingPlot}
        onOpenChange={(open) => {
          if (!open) setPendingPlot(null);
        }}
        onCreated={(missionId) => useRobotMissionStore.getState().selectMission(missionId)}
      />
    </div>
  );
}
