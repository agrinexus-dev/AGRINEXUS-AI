"use client";

import { useEffect, useState, type RefObject } from "react";
import { Map } from "lucide-react";

import { Panel, Typography } from "@agrinexus/ui";
import { useFleetDrones } from "@/lib/fleet/fleet-store";
import { useFindings } from "@/lib/findings/finding-store";
import type { CropIssueSeverity } from "@/lib/findings/types";
import { useRobots } from "@/lib/robots/robot-store";

import type { CameraRigHandle } from "../scene/camera-rig";
import { buildings, farmGate, fenceHalfExtent, roadSpurs } from "../scene/farm-data";
import type { AutonomousUnitHandle } from "../scene/systems/types";

const WORLD_HALF_EXTENT = 32;
const VIEW_SIZE = WORLD_HALF_EXTENT * 2;
const POLL_INTERVAL_MS = 200;

// Same severity palette `finding-markers.tsx` uses for the
// 3D scene, kept as its own small local copy (this file is a
// self-contained SVG presentation component with no other cross-imports
// from `scene/`, matching its existing style) rather than a shared export,
// so both readings stay visually consistent without a new shared module.
const FINDING_SEVERITY_COLORS: Record<CropIssueSeverity, string> = {
  low: "#f6ad55",
  medium: "#f0a020",
  high: "#ef4444",
  critical: "#b91c1c",
};
function toView(x: number, z: number): [number, number] {
  return [x + WORLD_HALF_EXTENT, z + WORLD_HALF_EXTENT];
}

export interface MiniMapProps {
  cameraRigRef: RefObject<CameraRigHandle | null>;
  /** Every fleet drone's live handle, keyed by id — replaces the old single `droneRef` so the map can plot however many drones the Fleet Store holds. */
  droneRefs: RefObject<Map<string, AutonomousUnitHandle>>;
  /** Every fleet robot's live handle, keyed by id — mirrors `droneRefs`, replacing the old single `robotRef`. */
  robotRefs: RefObject<Map<string, AutonomousUnitHandle>>;
}

/**
 * Real, non-interactive top-down layout: farm boundary, road network,
 * buildings, waypoints, and the live camera/drone/robot positions. Camera
 * state comes from the existing `CameraRig` handle; drone/robot positions
 * come from the same `getObject()` accessor Camera Follow uses — this reads
 * the live Object3D's transform directly rather than tracking a second,
 * parallel position. All polled at low frequency; the 3D viewport itself
 * still updates at full frame rate.
 */
export function MiniMap({ cameraRigRef, droneRefs, robotRefs }: MiniMapProps) {
  const fleetDrones = useFleetDrones();
  const fleetRobots = useRobots();
  const findings = useFindings();
  const [camera, setCamera] = useState({ x: 0, z: 0, angle: 0 });
  const [dronePositions, setDronePositions] = useState<{ id: string; x: number; z: number }[]>([]);
  const [robotPositions, setRobotPositions] = useState<{ id: string; x: number; z: number }[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const position = cameraRigRef.current?.getPosition();
      if (position) setCamera(position);

      const positions: { id: string; x: number; z: number }[] = [];
      for (const [id, handle] of droneRefs.current) {
        const object = handle.getObject();
        if (object) positions.push({ id, x: object.position.x, z: object.position.z });
      }
      setDronePositions(positions);

      const robotPos: { id: string; x: number; z: number }[] = [];
      for (const [id, handle] of robotRefs.current) {
        const object = handle.getObject();
        if (object) robotPos.push({ id, x: object.position.x, z: object.position.z });
      }
      setRobotPositions(robotPos);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [cameraRigRef, droneRefs, robotRefs]);

  const [boundaryX, boundaryY] = toView(-fenceHalfExtent, -fenceHalfExtent);
  const [camX, camY] = toView(camera.x, camera.z);
  const [gateX, gateY] = toView(farmGate.center[0], farmGate.center[1]);
  const angleDeg = (camera.angle * 180) / Math.PI;

  const fleetWaypoints = fleetDrones.flatMap((drone) => drone.route.waypoints);
  const robotWaypoints = fleetRobots.flatMap((robot) => robot.route.waypoints);

  return (
    <Panel variant="glass" padding="sm" className="flex w-40 flex-col gap-1.5 shadow-elevated">
      <div className="flex items-center gap-1.5 text-foreground-muted">
        <Map className="size-3.5" aria-hidden />
        <Typography variant="caption">Mini-map</Typography>
      </div>

      <svg viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="h-28 w-full rounded-sm bg-surface" aria-hidden>
        <rect
          x={boundaryX}
          y={boundaryY}
          width={fenceHalfExtent * 2}
          height={fenceHalfExtent * 2}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={0.6}
        />

        <line x1={toView(-30, 0)[0]} y1={toView(-30, 0)[1]} x2={toView(30, 0)[0]} y2={toView(30, 0)[1]} stroke="#4a5058" strokeWidth={1.2} />
        <line x1={toView(0, -30)[0]} y1={toView(0, -30)[1]} x2={toView(0, 30)[0]} y2={toView(0, 30)[1]} stroke="#4a5058" strokeWidth={1.2} />

        {roadSpurs.map((spur) => {
          const [sx, sy] = toView(spur.center[0], spur.center[1]);
          return (
            <rect
              key={spur.id}
              x={sx - spur.size[0] / 2}
              y={sy - spur.size[1] / 2}
              width={spur.size[0]}
              height={spur.size[1]}
              fill="#4a5058"
            />
          );
        })}

        {buildings.map((building) => {
          const [bx, by] = toView(building.center[0], building.center[1]);
          return (
            <rect
              key={building.id}
              x={bx - building.size[0] / 2}
              y={by - building.size[1] / 2}
              width={building.size[0]}
              height={building.size[1]}
              fill="var(--color-accent)"
              opacity={0.7}
            />
          );
        })}

        <circle cx={gateX} cy={gateY} r={1} fill="#e8b339" />

        {[...fleetWaypoints, ...robotWaypoints].map((waypoint) => {
          const [wx, wy] = toView(waypoint.position[0], waypoint.position[1]);
          return <circle key={waypoint.id} cx={wx} cy={wy} r={0.5} fill="none" stroke="#7a8390" strokeWidth={0.3} />;
        })}

        {/* The SAME finding position the 3D scene's
            `FindingMarkers` renders (`useFindings()` reads from the identical
            Finding Store), run through this map's own `toView()` — one
            canonical (x, z) per finding, never a second coordinate. A small
            diamond (rotated square) so it reads distinctly from the round
            drone/robot/waypoint dots at this tiny scale. */}
        {/* A resolved finding is removed from this active
            view entirely (the underlying record is untouched — Analytics/
            AURA/history still see it via `useFindings()` elsewhere). No
            fade here (unlike the 3D marker's animated version) — this is a
            small, low-frequency-refresh SVG overlay; an instant disappear
            reads fine at this scale, and matching the 3D marker's tween
            wasn't judged worth the added state-tracking machinery for a
            secondary view. See the Phase 4 report. */}
        {findings
          .filter((finding) => finding.status !== "resolved")
          .map((finding) => {
            const [fx, fy] = toView(finding.position[0], finding.position[1]);
            const color = FINDING_SEVERITY_COLORS[finding.severity];
            return (
              <rect
                key={finding.id}
                x={fx - 0.6}
                y={fy - 0.6}
                width={1.2}
                height={1.2}
                transform={`rotate(45 ${fx} ${fy})`}
                fill={color}
              />
            );
          })}

        {dronePositions.map(({ id, x, z }) => {
          const [dx, dy] = toView(x, z);
          return <circle key={id} cx={dx} cy={dy} r={1.1} fill="#4fd1c5" />;
        })}
        {robotPositions.map(({ id, x, z }) => {
          const [rx, ry] = toView(x, z);
          return <circle key={id} cx={rx} cy={ry} r={1.1} fill="#f6ad55" />;
        })}

        <g transform={`translate(${camX} ${camY}) rotate(${angleDeg})`}>
          <path d="M 0 -2.4 L 1.6 1.6 L -1.6 1.6 Z" fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={0.3} />
        </g>
      </svg>
    </Panel>
  );
}
