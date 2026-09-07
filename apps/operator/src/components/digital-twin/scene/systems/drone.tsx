"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { useLiveContextStore } from "@/lib/aura/context/live-context-store";
import { useFleetStore } from "@/lib/fleet/fleet-store";
import { DRONE_STATUS_LABELS, type DroneRenderConfig } from "@/lib/fleet/types";
import { getActiveMissionStatusForDrone } from "@/lib/missions/mission-store";
import { MISSION_FLIGHT_STATUSES } from "@/lib/missions/types";
import { SIMULATION_TIME_SCALE } from "@/lib/missions/use-mission-simulation";

import type { SelectableEntity } from "../../types";
import { useModelScene } from "../use-model-part";
import { advanceRouteCursor, frameLerpFactor, lerpAngle, type RouteCursor } from "./motion-utils";
import type { AutonomousUnitHandle } from "./types";

const ARRIVAL_EPSILON = 0.15;
const TURN_LERP_BASE = 0.1;
const HOVER_AMPLITUDE = 0.15;
const HOVER_SPEED = 1.6;
const MODEL_URL = "/models/drone-agri.glb";
// Matches the old placeholder's final ~1.35m x 1.44m footprint so the
// hardcoded LED/ring offsets below still land at the wingtips/body correctly.
const MODEL_SCALE = 1.75;
const LED_BLINK_SPEED = 5;
useGLTF.preload(MODEL_URL);

export interface DroneProps {
  /** Everything that makes this drone instance distinct — id, label, patrol route, altitude, speed — read from the Fleet Store rather than hardcoded. */
  config: DroneRenderConfig;
  selectedId: string | null;
  onSelect: (entity: SelectableEntity) => void;
}

/**
 * One fleet drone: continuously patrols `config.route` at constant altitude.
 * Movement/rotation/hover is pure `useFrame` ref mutation — no React state
 * is touched per frame. `getStatus()` is polled externally (Details Panel,
 * the Fleet Store telemetry sync) at a throttled interval rather than
 * pushed via setState. Identical movement/visual logic to the original
 * single-drone version — only the data source (props instead of hardcoded
 * imports) changed, so an arbitrary number of these can be rendered at once
 * (see `scene.tsx`).
 */
export const Drone = forwardRef<AutonomousUnitHandle, DroneProps>(function Drone({ config, selectedId, onSelect }, ref) {
  const groupRef = useRef<THREE.Group>(null);
  const cursor = useRef<RouteCursor>({ index: 0, direction: 1 });
  const hoverPhase = useRef(0);
  const toTarget = useRef(new THREE.Vector3());
  const [hovered, setHovered] = useState(false);
  const selected = selectedId === config.id;
  const indicatorActive = selected || hovered;

  const { scene: modelScene } = useModelScene(MODEL_URL, { ground: false });
  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.34, 0.4, 24), []);
  const ringMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#4fd1c5", transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    [],
  );

  // Navigation LEDs (visual only): aviation-style port/starboard + strobe.
  const ledGeometry = useMemo(() => new THREE.SphereGeometry(0.045, 8, 8), []);
  const portLedMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#ff3b3b", emissive: "#ff3b3b", emissiveIntensity: 1.4, toneMapped: false }),
    [],
  );
  const starboardLedMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3bff6a", emissive: "#3bff6a", emissiveIntensity: 1.4, toneMapped: false }),
    [],
  );
  const strobeMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0, toneMapped: false }),
    [],
  );

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    strobeMaterial.emissiveIntensity = Math.max(0, Math.sin(state.clock.elapsedTime * LED_BLINK_SPEED)) ** 6 * 3;

    // While this drone is actively flying a mission, its real
    // position must stay synchronized with that mission's progress clock
    // (`use-mission-simulation.ts`), which advances at `SIMULATION_TIME_SCALE`
    // — a paused mission freezes the drone in place (no hidden movement
    // continues), and a flying one applies the SAME acceleration factor
    // the progress clock uses, rather than this loop moving at real,
    // unaccelerated speed while progress raced ahead 12x faster. Patrol
    // (no active mission) is completely unaffected — `missionStatus` is
    // `null` and `speedMultiplier` stays 1, exactly as before.
    const missionStatus = getActiveMissionStatusForDrone(config.id);
    if (missionStatus === "paused") return;
    const speedMultiplier = missionStatus && MISSION_FLIGHT_STATUSES.includes(missionStatus) ? SIMULATION_TIME_SCALE : 1;

    const waypoints = config.route.waypoints;
    const target = waypoints[cursor.current.index];
    if (target) {
      toTarget.current.set(target.position[0] - group.position.x, 0, target.position[1] - group.position.z);
      const distance = toTarget.current.length();

      if (distance < ARRIVAL_EPSILON) {
        cursor.current = advanceRouteCursor(cursor.current, waypoints.length, config.route.loop);
      } else {
        toTarget.current.normalize();
        const step = Math.min(distance, config.speedMps * speedMultiplier * delta);
        group.position.x += toTarget.current.x * step;
        group.position.z += toTarget.current.z * step;

        const desiredYaw = Math.atan2(toTarget.current.x, toTarget.current.z);
        group.rotation.y = lerpAngle(group.rotation.y, desiredYaw, frameLerpFactor(TURN_LERP_BASE, delta));
      }
    }

    hoverPhase.current += delta * HOVER_SPEED;
    group.position.y = config.altitude + Math.sin(hoverPhase.current) * HOVER_AMPLITUDE;
  });

  useImperativeHandle(ref, () => ({
    getObject: () => groupRef.current,
    getStatus: () => {
      const waypoint = config.route.waypoints[cursor.current.index];
      // Was hardcoded `"Patrolling"`, which is exactly
      // the kind of stale/dishonest label this change's fix is about (the
      // Details Panel itself already reads the real status straight from
      // the Fleet Store, not from here — this snapshot read just keeps
      // this handle's own return value honest too, for any other caller).
      const liveStatus = useFleetStore.getState().drones[config.id]?.status ?? "idle";
      return {
        batteryPercent: config.batteryPercent,
        speedMps: config.speedMps,
        status: DRONE_STATUS_LABELS[liveStatus],
        currentLabel: waypoint?.label ?? config.route.waypoints[0]?.label ?? "—",
      };
    },
  }));

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect({ id: config.id, type: "drone", label: config.label, meta: "Autonomous aerial unit" });
  }

  return (
    <group
      ref={groupRef}
      position={[config.route.waypoints[0]?.position[0] ?? 0, config.altitude, config.route.waypoints[0]?.position[1] ?? 0]}
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
        useLiveContextStore.getState().publishHover({ id: config.id, type: "drone", label: config.label });
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
        useLiveContextStore.getState().publishHover(null);
      }}
    >
      <primitive object={modelScene} scale={MODEL_SCALE} />
      <mesh geometry={ledGeometry} material={portLedMaterial} position={[-0.32, 0, 0.05]} />
      <mesh geometry={ledGeometry} material={starboardLedMaterial} position={[0.32, 0, 0.05]} />
      <mesh geometry={ledGeometry} material={strobeMaterial} position={[0, 0.14, -0.28]} />
      {indicatorActive ? (
        <mesh geometry={ringGeometry} material={ringMaterial} position={[0, -0.32, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      ) : null}
    </group>
  );
});
