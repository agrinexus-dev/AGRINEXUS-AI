"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { useLiveContextStore } from "@/lib/aura/context/live-context-store";
import { getActiveMissionStatusForRobot } from "@/lib/robot-missions/robot-mission-store";
import { ROBOT_MISSION_ACTIVE_STATUSES } from "@/lib/robot-missions/types";
import { SIMULATION_TIME_SCALE } from "@/lib/robot-missions/use-robot-mission-simulation";
import { ROBOT_MOVING_STATUSES, ROBOT_STATUS_LABELS, type RobotRenderConfig } from "@/lib/robots/types";

import type { SelectableEntity } from "../../types";
import { useModelScene } from "../use-model-part";
import { advanceRouteCursor, frameLerpFactor, lerpAngle, type RouteCursor } from "./motion-utils";
import type { AutonomousUnitHandle } from "./types";

const ARRIVAL_EPSILON = 0.12;
const TURN_LERP_BASE = 0.14;
const PAUSE_SECONDS = 1.1;
const CHASSIS_Y = 0.16;
const MODEL_URL = "/models/rover.glb";
// Raw model is ~4.6m x 4.9m x 6.6m; scaled down to a ~0.9m long ground rover.
const MODEL_SCALE = 0.14;
const LED_PULSE_SPEED = 2.4;
useGLTF.preload(MODEL_URL);

export interface RobotProps {
  /** Everything that makes this robot instance distinct — id, label, patrol/shuttle route, speed, color, live status — read from the Robot Store rather than hardcoded. */
  config: RobotRenderConfig;
  selectedId: string | null;
  onSelect: (entity: SelectableEntity) => void;
}

/**
 * One fleet robot: patrols `config.route`, pausing briefly at each waypoint
 * before continuing — identical movement/visual logic to the original
 * single-robot (Robot Bravo) version. Only the data source (props instead of
 * hardcoded imports) and the `config.status` movement gate are new, mirroring
 * exactly how `scene/systems/drone.tsx` was generalized from one hardcoded
 * drone into a fleet. Movement is pure `useFrame` ref
 * mutation — no per-frame React state.
 */
export const Robot = forwardRef<AutonomousUnitHandle, RobotProps>(function Robot({ config, selectedId, onSelect }, ref) {
  const groupRef = useRef<THREE.Group>(null);
  const cursor = useRef<RouteCursor>({ index: 0, direction: 1 });
  const pauseRemaining = useRef(0);
  const toTarget = useRef(new THREE.Vector3());
  const [hovered, setHovered] = useState(false);
  const selected = selectedId === config.id;
  const indicatorActive = selected || hovered;
  const canMove = ROBOT_MOVING_STATUSES.includes(config.status);

  const { scene: modelScene, groundOffset } = useModelScene(MODEL_URL);
  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.3, 0.36, 24), []);
  const ringMaterial = useMemo(
    // Rebuilt only if the robot's own color changes (essentially never after
    // creation) — not per render, keeping this in line with the drone's own
    // `useMemo`-cached materials.
    () => new THREE.MeshBasicMaterial({ color: config.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    [config.color],
  );

  // Status LED (visual only): slow pulse tinted to this robot's own color.
  const ledGeometry = useMemo(() => new THREE.SphereGeometry(0.05, 8, 8), []);
  const ledMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: config.color, emissive: config.color, emissiveIntensity: 1, toneMapped: false }),
    [config.color],
  );

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    ledMaterial.emissiveIntensity = 0.6 + Math.sin(state.clock.elapsedTime * LED_PULSE_SPEED) * 0.5;

    // Parked whenever the Robot Store says so (paused/charging/idle/
    // maintenance/offline) — see `ROBOT_MOVING_STATUSES`. The LED above still
    // pulses so a parked-but-selected robot doesn't read as "dead" in the
    // viewport.
    if (!canMove) return;

    // While this robot is actively driving a mission, its real
    // position must stay synchronized with that mission's progress clock
    // (`use-robot-mission-simulation.ts`), which advances at
    // `SIMULATION_TIME_SCALE` — a paused mission freezes the robot in place
    // (checked here, live, since a mission pausing does not change the
    // robot's OWN `status`/`ROBOT_MOVING_STATUSES` gate above), and a
    // driving one applies the SAME acceleration factor the progress clock
    // uses, rather than this loop moving at real, unaccelerated speed while
    // progress raced ahead 12x faster. Patrol (no active mission) is
    // unaffected — `missionStatus` is `null` and `speedMultiplier` stays 1.
    const missionStatus = getActiveMissionStatusForRobot(config.id);
    if (missionStatus === "paused") return;
    const onActiveMission = missionStatus !== null && ROBOT_MISSION_ACTIVE_STATUSES.includes(missionStatus);
    const speedMultiplier = onActiveMission ? SIMULATION_TIME_SCALE : 1;

    // The per-waypoint pause below is a purely cosmetic
    // "look, it's inspecting this row" touch, harmless during ordinary
    // patrol (nothing else is racing against real time then). During an
    // ACTIVE MISSION it is not harmless: a generated ground route can carry
    // dozens of row waypoints (`generateGroundRoute`'s boustrophedon
    // pattern), and `use-robot-mission-simulation.ts`'s progress/completion
    // clock has no idea this component is standing still between them — it
    // keeps accumulating `effectiveSpeedMps * elapsedSeconds` regardless.
    // With enough waypoints, the real seconds spent paused here alone
    // outweighed the real seconds the progress clock allotted for the
    // WHOLE route, so the mission was completing while the robot had
    // visually covered only its first couple of rows — the exact bug
    // report ("travels through only a few crop columns, then the mission
    // ends"). The fix is to keep both sides honestly moving at the same
    // real-time rate during a mission — skip the pause entirely while
    // `onActiveMission`, rather than touching the route generator or the
    // completion condition (which were both already correct).
    if (!onActiveMission) {
      if (pauseRemaining.current > 0) {
        pauseRemaining.current -= delta;
        return;
      }
    }

    const waypoints = config.route.waypoints;
    const target = waypoints[cursor.current.index];
    if (!target) return;

    toTarget.current.set(target.position[0] - group.position.x, 0, target.position[1] - group.position.z);
    const distance = toTarget.current.length();

    if (distance < ARRIVAL_EPSILON) {
      group.position.x = target.position[0];
      group.position.z = target.position[1];
      if (!onActiveMission) pauseRemaining.current = PAUSE_SECONDS;
      cursor.current = advanceRouteCursor(cursor.current, waypoints.length, config.route.loop);
      return;
    }

    toTarget.current.normalize();
    const step = Math.min(distance, config.speedMps * speedMultiplier * delta);
    group.position.x += toTarget.current.x * step;
    group.position.z += toTarget.current.z * step;

    const desiredYaw = Math.atan2(toTarget.current.x, toTarget.current.z);
    group.rotation.y = lerpAngle(group.rotation.y, desiredYaw, frameLerpFactor(TURN_LERP_BASE, delta));
  });

  useImperativeHandle(ref, () => ({
    getObject: () => groupRef.current,
    getStatus: () => {
      const waypoint = config.route.waypoints[cursor.current.index];
      return {
        batteryPercent: config.batteryPercent,
        speedMps: config.speedMps,
        status: ROBOT_STATUS_LABELS[config.status],
        currentLabel: waypoint?.label ?? config.route.waypoints[0]?.label ?? "—",
      };
    },
  }));

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect({ id: config.id, type: "robot", label: config.label, meta: "Autonomous ground unit" });
  }

  return (
    <group
      ref={groupRef}
      position={[config.route.waypoints[0]?.position[0] ?? 0, CHASSIS_Y, config.route.waypoints[0]?.position[1] ?? 0]}
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
        useLiveContextStore.getState().publishHover({ id: config.id, type: "robot", label: config.label });
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
        useLiveContextStore.getState().publishHover(null);
      }}
    >
      <primitive object={modelScene} scale={MODEL_SCALE} position={[0, groundOffset * MODEL_SCALE, 0]} />
      <mesh geometry={ledGeometry} material={ledMaterial} position={[0, 0.22, 0.12]} />
      {indicatorActive ? (
        <mesh geometry={ringGeometry} material={ringMaterial} position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      ) : null}
    </group>
  );
});
