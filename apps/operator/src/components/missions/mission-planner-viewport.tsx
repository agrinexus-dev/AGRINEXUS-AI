"use client";

import { useCallback, useRef, useState } from "react";
import { MapPin } from "lucide-react";

import { Panel, Typography } from "@agrinexus/ui";

import type { CameraRigHandle } from "@/components/digital-twin/scene/camera-rig";
import { farmPlots, type FarmPlotDefinition } from "@/components/digital-twin/scene/farm-data";
import { Scene } from "@/components/digital-twin/scene/scene";
import { DEFAULT_LAYER_VISIBILITY, type SelectableEntity } from "@/components/digital-twin/types";
import { useFleetDroneRenderConfigs } from "@/lib/fleet/fleet-store";
import { useMissionStore } from "@/lib/missions/mission-store";
import { useRobotRenderConfigs } from "@/lib/robots/robot-store";

import { CreateMissionDialog } from "./create-mission-dialog";

const NOOP_DRONE_REF = () => {};
const NOOP_ROBOT_REF = () => {};

/**
 * The "CENTER PANEL — Mission Planner" — the exact same
 * `Scene` the full `/digital-twin` page renders, reused (not duplicated),
 * the same way `DigitalTwinHeroWidget` already reuses it on the Command
 * Center. Unlike that widget this one stays fully interactive (orbit/pan/
 * zoom via `CameraRig`'s always-mounted `OrbitControls`, click-to-select via
 * the existing `Crops`/`FarmPlots` layers' own `onSelect` callback) so
 * clicking a plot can drive "Click Plot → Create Mission" — no Google Maps/
 * Leaflet/Mapbox, no second coordinate system.
 */
export function MissionPlannerViewport() {
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
          <Typography variant="caption">Click a plot to create a mission</Typography>
        </Panel>
      </div>

      <CreateMissionDialog
        plot={pendingPlot}
        onOpenChange={(open) => {
          if (!open) setPendingPlot(null);
        }}
        onCreated={(missionId) => useMissionStore.getState().selectMission(missionId)}
      />
    </div>
  );
}
