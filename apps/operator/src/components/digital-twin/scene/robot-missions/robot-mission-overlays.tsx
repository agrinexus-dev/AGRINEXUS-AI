"use client";

import { Fragment } from "react";
import { Html, Line } from "@react-three/drei";

import { Panel, StatusBadge, Typography, type Status } from "@agrinexus/ui";

import { useRobotStore } from "@/lib/robots/robot-store";
import { useRobotMissions } from "@/lib/robot-missions/robot-mission-store";
import {
  ROBOT_MISSION_ACTIVE_STATUSES,
  ROBOT_MISSION_STATUS_LABELS,
  ROBOT_MISSION_TYPE_LABELS,
  type RobotMissionRecord,
  type RobotMissionStatus,
  type RobotMissionType,
  type RobotMissionWaypoint,
} from "@/lib/robot-missions/types";

import { farmPlots, type FarmPlotDefinition } from "../farm-data";
import type { LayerVisibility } from "../../types";

// Offset slightly from the drone Mission Overlays' own Y values (BOUNDARY_Y
// 0.06 / PATH_Y 0.09 / COVERAGE_Y 0.045 / WAYPOINT_Y 0.35 / LABEL_Y 6.5, see
// `scene/missions/mission-overlays.tsx`) so a robot mission and a drone
// mission targeting the same plot never z-fight — the two overlay systems
// coexist in the same scene without visually merging into one.
const BOUNDARY_Y = 0.07;
const PATH_Y = 0.1;
const COVERAGE_Y = 0.05;
const WAYPOINT_Y = 0.3;
const LABEL_Y = 4.5;

// A warm/earthy palette, deliberately distinct from the drone Mission
// Overlays' cooler blue/green/red set — Robot Bravo's own
// accent color (#f6ad55) anchors the family, so ground-robot mission
// overlays read as visually related to the robots themselves.
const ROBOT_MISSION_TYPE_COLORS: Record<RobotMissionType, string> = {
  "crop-inspection": "#c2703d",
  "weed-detection": "#8a9a5b",
  "targeted-spraying": "#4f772d",
  "precision-fertilization": "#b08968",
  "soil-sampling": "#7f5539",
  "seed-planting": "#a3b18a",
  "ground-imaging": "#e9c46a",
  "autonomous-patrol": "#f4a261",
  "manual-drive": "#9aa5b1",
};

const ROBOT_MISSION_STATUS_BADGE: Record<RobotMissionStatus, Status> = {
  queued: "info",
  preparing: "nominal",
  driving: "nominal",
  working: "nominal",
  returning: "nominal",
  completed: "nominal",
  paused: "attention",
  cancelled: "offline",
};

export interface RobotMissionOverlaysProps {
  layers: LayerVisibility;
}

/**
 * Every robot mission's boundary/route/waypoints/labels, composed behind its
 * own mount point in `scene.tsx` — a SEPARATE component tree
 * from `MissionOverlays` (drones), gated by its own independent
 * `robotMission*` layer keys, so hiding/showing one never affects the other
 * and both coexist in the same scene. Subscribes to the Robot Mission Store
 * directly, so a simulation tick only rerenders this subtree, never the rest
 * of the (memoized) Scene — same isolation `MissionOverlays` already
 * establishes.
 */
export function RobotMissionOverlays({ layers }: RobotMissionOverlaysProps) {
  const missions = useRobotMissions();
  // Mirrors `MissionOverlays`' own filter: a marker (boundary + label)
  // appears the moment a mission targets a plot, even before "Generate
  // Route" — matching the prompt's own flow order (marker before route).
  const visible = missions.filter((mission) => (mission.targetPlotId || mission.waypoints.length > 0) && mission.status !== "cancelled");

  return (
    <group>
      {visible.map((mission) => (
        <RobotMissionOverlay key={mission.id} mission={mission} layers={layers} />
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

function RobotMissionOverlay({ mission, layers }: { mission: RobotMissionRecord; layers: LayerVisibility }) {
  const plot = farmPlots.find((candidate) => candidate.id === mission.targetPlotId);
  const robotName = useRobotStore((state) => (mission.assignedRobotId ? (state.robots[mission.assignedRobotId]?.name ?? null) : null));
  const color = ROBOT_MISSION_TYPE_COLORS[mission.missionType];
  const inProgress = ROBOT_MISSION_ACTIVE_STATUSES.includes(mission.status);

  return (
    <group>
      {layers.robotMissionBoundaries && plot ? (
        <Line points={plotBoundaryPoints(plot)} color={color} lineWidth={2} dashed={mission.status === "queued"} dashSize={0.4} gapSize={0.25} />
      ) : null}

      {layers.robotMissionCoverage && plot ? (
        <mesh position={[plot.center[0], COVERAGE_Y, plot.center[1]]} rotation={[-Math.PI / 2, 0, 0]} scale={[plot.size[0] - 2, plot.size[1] - 2, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color={color} transparent opacity={0.05 + (mission.coverageProgressPercent / 100) * 0.3} depthWrite={false} />
        </mesh>
      ) : null}

      {layers.robotMissionRoutes && mission.waypoints.length > 1 ? (
        <Line points={mission.waypoints.map((wp): [number, number, number] => [wp.position[0], PATH_Y, wp.position[1]])} color={color} lineWidth={2.5} />
      ) : null}

      {layers.robotMissionWaypoints
        ? mission.waypoints.map((waypoint, index) => (
            <WaypointMarker
              key={waypoint.id}
              waypoint={waypoint}
              index={index}
              color={color}
              isCurrent={layers.robotMissionCurrentTarget && inProgress && index === mission.currentWaypointIndex}
            />
          ))
        : null}

      {layers.robotMissionLabels ? <RobotMissionLabel mission={mission} plot={plot} robotName={robotName} /> : null}
    </group>
  );
}

function WaypointMarker({
  waypoint,
  index,
  color,
  isCurrent,
}: {
  waypoint: RobotMissionWaypoint;
  index: number;
  color: string;
  isCurrent: boolean;
}) {
  const markerColor = isCurrent ? "#ffd166" : color;

  return (
    <Fragment>
      {/* A cube instead of the drone overlay's sphere — a small, deliberate
          shape difference so a robot mission waypoint reads as distinct from
          a drone mission waypoint at a glance, even where both appear near
          the same plot. */}
      <mesh position={[waypoint.position[0], WAYPOINT_Y, waypoint.position[1]]}>
        <boxGeometry args={isCurrent ? [0.42, 0.42, 0.42] : [0.28, 0.28, 0.28]} />
        <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={isCurrent ? 0.9 : 0.45} toneMapped={false} />
      </mesh>
      <Html position={[waypoint.position[0], WAYPOINT_Y + 0.45, waypoint.position[1]]} center distanceFactor={14} zIndexRange={[15, 0]}>
        <div className="flex size-5 items-center justify-center rounded-full bg-surface-elevated/90 text-[10px] font-semibold text-foreground shadow-elevated">
          {index + 1}
        </div>
      </Html>
    </Fragment>
  );
}

function RobotMissionLabel({
  mission,
  plot,
  robotName,
}: {
  mission: RobotMissionRecord;
  plot: FarmPlotDefinition | undefined;
  robotName: string | null;
}) {
  const anchor = plot ? plot.center : mission.homePosition;
  if (!anchor) return null;

  return (
    <Html position={[anchor[0], LABEL_Y, anchor[1]]} center distanceFactor={16} zIndexRange={[24, 0]}>
      <Panel variant="glass" padding="sm" className="flex w-56 flex-col gap-1.5 shadow-elevated">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <Typography variant="caption">{ROBOT_MISSION_TYPE_LABELS[mission.missionType]}</Typography>
            <Typography variant="small" className="font-medium text-foreground">
              {mission.name}
            </Typography>
          </div>
          <StatusBadge status={ROBOT_MISSION_STATUS_BADGE[mission.status]} label={ROBOT_MISSION_STATUS_LABELS[mission.status]} />
        </div>
        <StatRow label="Robot" value={robotName ?? "Unassigned"} />
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
