"use client";

import { Fragment } from "react";
import { Html, Line } from "@react-three/drei";

import { Panel, StatusBadge, Typography, type Status } from "@agrinexus/ui";

import { useFleetStore } from "@/lib/fleet/fleet-store";
import { useMissions } from "@/lib/missions/mission-store";
import { MISSION_FLIGHT_STATUSES, MISSION_STATUS_LABELS, MISSION_TYPE_LABELS, type MissionRecord, type MissionStatus, type MissionType, type MissionWaypoint } from "@/lib/missions/types";

import { farmPlots, type FarmPlotDefinition } from "../farm-data";
import type { LayerVisibility } from "../../types";

const BOUNDARY_Y = 0.06;
const PATH_Y = 0.09;
const COVERAGE_Y = 0.045;
const WAYPOINT_Y = 0.35;
const LABEL_Y = 6.5;

const MISSION_TYPE_COLORS: Record<MissionType, string> = {
  survey: "#5b9bd5",
  "crop-health": "#4fae7a",
  "disease-scan": "#e0975a",
  "thermal-scan": "#e05656",
  ndvi: "#a684e8",
  "rgb-capture": "#5bc0de",
  "irrigation-inspection": "#38bdf8",
  "emergency-inspection": "#f6ad55",
  manual: "#9aa5b1",
};

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

export interface MissionOverlaysProps {
  layers: LayerVisibility;
}

/**
 * Every mission's boundary/flight-path/waypoints/labels, composed behind one
 * mount point in `scene.tsx` — the exact same additive pattern
 * `IntelligenceLayers` already establishes: this component subscribes to the
 * Mission Store itself, so a simulation tick only rerenders this subtree,
 * never the rest of the (memoized) Scene. Missions with no generated path
 * yet, or that were cancelled, render nothing.
 */
export function MissionOverlays({ layers }: MissionOverlaysProps) {
  const missions = useMissions();
  // A mission gets a marker (boundary + label) the moment it targets a plot
  // — even before "Generate Path" — so "Click Plot → Create Mission →
  // Mission Marker appears" (the prompt's own flow) holds before a flight
  // path exists. The path/waypoint sub-layers below each separately no-op
  // until `waypoints` is populated, so nothing there needs a fake path.
  const visible = missions.filter((mission) => (mission.targetPlotId || mission.waypoints.length > 0) && mission.status !== "cancelled");

  return (
    <group>
      {visible.map((mission) => (
        <MissionOverlay key={mission.id} mission={mission} layers={layers} />
      ))}
    </group>
  );
}

function plotBoundaryPoints(plot: FarmPlotDefinition): [number, number, number][] {
  const [cx, cz] = plot.center;
  const [width, depth] = plot.size;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  return [
    [cx - halfWidth, BOUNDARY_Y, cz - halfDepth],
    [cx + halfWidth, BOUNDARY_Y, cz - halfDepth],
    [cx + halfWidth, BOUNDARY_Y, cz + halfDepth],
    [cx - halfWidth, BOUNDARY_Y, cz + halfDepth],
    [cx - halfWidth, BOUNDARY_Y, cz - halfDepth],
  ];
}

function MissionOverlay({ mission, layers }: { mission: MissionRecord; layers: LayerVisibility }) {
  const plot = farmPlots.find((candidate) => candidate.id === mission.targetPlotId);
  const droneName = useFleetStore((state) => (mission.assignedDroneId ? (state.drones[mission.assignedDroneId]?.name ?? null) : null));
  const color = MISSION_TYPE_COLORS[mission.missionType];
  const inFlight = MISSION_FLIGHT_STATUSES.includes(mission.status);

  return (
    <group>
      {layers.missionBoundaries && plot ? (
        <Line points={plotBoundaryPoints(plot)} color={color} lineWidth={2} dashed={mission.status === "queued"} dashSize={0.6} gapSize={0.35} />
      ) : null}

      {layers.missionCoverage && plot ? (
        <mesh position={[plot.center[0], COVERAGE_Y, plot.center[1]]} rotation={[-Math.PI / 2, 0, 0]} scale={[plot.size[0] - 2, plot.size[1] - 2, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color={color} transparent opacity={0.05 + (mission.coverageProgressPercent / 100) * 0.3} depthWrite={false} />
        </mesh>
      ) : null}

      {layers.missionPaths && mission.waypoints.length > 1 ? (
        <Line points={mission.waypoints.map((wp): [number, number, number] => [wp.position[0], PATH_Y, wp.position[1]])} color={color} lineWidth={2.5} />
      ) : null}

      {layers.missionWaypoints
        ? mission.waypoints.map((waypoint, index) => (
            <WaypointMarker
              key={waypoint.id}
              waypoint={waypoint}
              index={index}
              color={color}
              showNumber={layers.missionWaypointNumbers}
              isCurrent={layers.missionCurrentTarget && inFlight && index === mission.currentWaypointIndex}
            />
          ))
        : null}

      {layers.missionLabels ? <MissionLabel mission={mission} plot={plot} droneName={droneName} /> : null}
    </group>
  );
}

function WaypointMarker({
  waypoint,
  index,
  color,
  showNumber,
  isCurrent,
}: {
  waypoint: MissionWaypoint;
  index: number;
  color: string;
  showNumber: boolean;
  isCurrent: boolean;
}) {
  const markerColor = isCurrent ? "#ffd166" : color;

  return (
    <Fragment>
      <mesh position={[waypoint.position[0], WAYPOINT_Y, waypoint.position[1]]}>
        <sphereGeometry args={[isCurrent ? 0.3 : 0.2, 12, 12]} />
        <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={isCurrent ? 0.9 : 0.45} toneMapped={false} />
      </mesh>
      {showNumber ? (
        <Html position={[waypoint.position[0], WAYPOINT_Y + 0.5, waypoint.position[1]]} center distanceFactor={14} zIndexRange={[15, 0]}>
          <div className="flex size-5 items-center justify-center rounded-full bg-surface-elevated/90 text-[10px] font-semibold text-foreground shadow-elevated">
            {index + 1}
          </div>
        </Html>
      ) : null}
    </Fragment>
  );
}

function MissionLabel({ mission, plot, droneName }: { mission: MissionRecord; plot: FarmPlotDefinition | undefined; droneName: string | null }) {
  const anchor = plot ? plot.center : mission.homePosition;
  if (!anchor) return null;

  return (
    <Html position={[anchor[0], LABEL_Y, anchor[1]]} center distanceFactor={16} zIndexRange={[25, 0]}>
      <Panel variant="glass" padding="sm" className="flex w-56 flex-col gap-1.5 shadow-elevated">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <Typography variant="caption">{MISSION_TYPE_LABELS[mission.missionType]}</Typography>
            <Typography variant="small" className="font-medium text-foreground">
              {mission.name}
            </Typography>
          </div>
          <StatusBadge status={MISSION_STATUS_BADGE[mission.status]} label={MISSION_STATUS_LABELS[mission.status]} />
        </div>
        <StatRow label="Drone" value={droneName ?? "Unassigned"} />
        <StatRow label="Progress" value={`${Math.round(mission.progressPercent)}%`} />
        <StatRow label="Coverage" value={`${Math.round(mission.coverageProgressPercent)}%`} />
        {mission.headingDegrees !== null ? <StatRow label="Heading" value={`${Math.round(mission.headingDegrees)}°`} /> : null}
        {mission.sensorJustification ? (
          <div title={mission.sensorJustification.reason} className="flex items-center gap-1 border-t border-border pt-1">
            <Typography variant="caption" className="text-accent">
              Sensor-triggered — {mission.sensorJustification.confidence} confidence
            </Typography>
          </div>
        ) : null}
      </Panel>
    </Html>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Typography variant="caption" className="text-foreground-subtle">
        {label}
      </Typography>
      <Typography variant="small" className="text-foreground">
        {value}
      </Typography>
    </div>
  );
}
