"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

import { farmGate, fenceHalfExtent, fencePosts, infrastructureItems } from "../farm-data";
import { useModelPart, useModelPartAt } from "../use-model-part";

const POST_HEIGHT = 1.1;
const MARK_COLOR = "#e8b339";
const MAST_COLOR = "#4a4f57";
const FENCE_COLOR = "#5a5148";
const DRONE_PAD_MODEL_URL = "/models/drone-charging-pad.glb";
const ROBOT_PAD_MODEL_URL = "/models/robot-charging-station.glb";
const PAD_MODEL_SCALE = 1.5;
useGLTF.preload(DRONE_PAD_MODEL_URL);
useGLTF.preload(ROBOT_PAD_MODEL_URL);

const SOLAR_PANEL_MODEL_URL = "/models/solar.glb";
// Raw (post node-correction) size is ~2.73m x 1.70m x 1.73m; scaled to match
// the old procedural panel's ~1.6m width.
const SOLAR_PANEL_MODEL_SCALE = 0.587;
useGLTF.preload(SOLAR_PANEL_MODEL_URL);

const FENCE_MODEL_URL = "/models/fence.glb";
// Raw height is ~8.57m; scaled to match the existing POST_HEIGHT exactly.
const FENCE_MODEL_SCALE = POST_HEIGHT / 8.568;
useGLTF.preload(FENCE_MODEL_URL);

const WATER_TOWER_MODEL_URL = "/models/water-tower.glb";
// Raw height is ~33.45m (municipal-scale); scaled down to a ~12m farm tower.
const WATER_TOWER_MODEL_SCALE = 0.359;
const WATER_TOWER_POSITION: [number, number] = [8, -26];
useGLTF.preload(WATER_TOWER_MODEL_URL);

/** Charging pads, weather station, solar array, the perimeter fence + gate, and the water tower. Not selectable this change. */
export function Infrastructure() {
  return (
    <group>
      {infrastructureItems.map((item) => (
        <InfrastructureFixture key={item.id} item={item} />
      ))}
      <Fence />
      <WaterTower />
    </group>
  );
}

function InfrastructureFixture({ item }: { item: (typeof infrastructureItems)[number] }) {
  const [x, z] = item.center;

  switch (item.kind) {
    case "drone-pad":
      return <ChargingPad position={[x, z]} accent={MARK_COLOR} modelUrl={DRONE_PAD_MODEL_URL} />;
    case "robot-station":
      return <ChargingPad position={[x, z]} accent="#4fd1c5" modelUrl={ROBOT_PAD_MODEL_URL} />;
    case "weather-station":
      return <WeatherStation position={[x, z]} />;
    case "solar-array":
      return <SolarArray position={[x, z]} />;
  }
}

function ChargingPad({ position: [x, z], accent, modelUrl }: { position: [number, number]; accent: string; modelUrl: string }) {
  const { geometry, material } = useModelPart(modelUrl);
  const ringGeometry = useMemo(() => new THREE.RingGeometry(1.1, 1.3, 20), []);
  const ringMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.5, roughness: 0.4 }),
    [accent],
  );

  return (
    <group position={[x, 0, z]}>
      <mesh geometry={geometry} material={material} scale={PAD_MODEL_SCALE} position={[0, 0.04, 0]} receiveShadow />
      <mesh geometry={ringGeometry} material={ringMaterial} position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  );
}

function WeatherStation({ position: [x, z] }: { position: [number, number] }) {
  const mastGeometry = useMemo(() => new THREE.CylinderGeometry(0.06, 0.08, 3, 8), []);
  const cupGeometry = useMemo(() => new THREE.SphereGeometry(0.12, 8, 8), []);
  const boxGeometry = useMemo(() => new THREE.BoxGeometry(0.4, 0.3, 0.25), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: MAST_COLOR, roughness: 0.6 }), []);

  return (
    <group position={[x, 0, z]}>
      <mesh geometry={mastGeometry} material={material} position={[0, 1.5, 0]} castShadow />
      <mesh geometry={boxGeometry} material={material} position={[0, 2.1, 0.18]} castShadow />
      {[0, 1, 2].map((index) => {
        const angle = (index / 3) * Math.PI * 2;
        return (
          <mesh
            key={index}
            geometry={cupGeometry}
            material={material}
            position={[Math.cos(angle) * 0.3, 3, Math.sin(angle) * 0.3]}
          />
        );
      })}
    </group>
  );
}

function SolarArray({ position: [x, z] }: { position: [number, number] }) {
  const part = useModelPartAt(SOLAR_PANEL_MODEL_URL);

  return (
    <group position={[x, 0, z]}>
      {[-2, 0, 2].map((offset) => (
        <mesh
          key={offset}
          geometry={part.geometry}
          material={part.material}
          position={[offset, 0, 0]}
          scale={SOLAR_PANEL_MODEL_SCALE}
          castShadow
        />
      ))}
    </group>
  );
}

function Fence() {
  const postRef = useRef<THREE.InstancedMesh>(null);
  const fencePart = useModelPartAt(FENCE_MODEL_URL);
  const postMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: FENCE_COLOR, roughness: 0.9 }), []);
  const railGeometry = useMemo(() => new THREE.BoxGeometry(1, 0.06, 0.06), []);
  const gatePostGeometry = useMemo(() => new THREE.CylinderGeometry(0.09, 0.09, 1.6, 8), []);
  const gatePostMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#7a6a52", roughness: 0.7 }), []);

  useEffect(() => {
    const mesh = postRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    // fence.glb is already re-grounded (base at y=0) by `useModelParts`, so
    // posts sit directly on the ground plane — no half-height lift needed
    // the way the old centered-pivot cylinder geometry required. Each
    // instance's own `rotationY` orients its long axis along whichever
    // world axis that side of the fence actually runs on — see
    // `FencePostPlacement.rotationY`'s doc comment in farm-data.ts for why
    // this is required (fence.glb is a long panel, not a symmetric post).
    fencePosts.forEach(({ position: [x, , z], rotationY }, index) => {
      quaternion.setFromEuler(new THREE.Euler(0, rotationY, 0));
      matrix.compose(
        new THREE.Vector3(x, 0, z),
        quaternion,
        new THREE.Vector3(FENCE_MODEL_SCALE, FENCE_MODEL_SCALE, FENCE_MODEL_SCALE),
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  const RAIL_HEIGHT = 0.7;

  // All 4 sides, from the SAME `fenceHalfExtent` bounds `buildFencePosts`
  // already uses. An earlier pass added these rails (previously only the
  // north side, with no gate on it, had one at all) but that alone did not
  // fix the reported misalignment — the actual root cause turned out to be
  // the fence.glb POST instances having no per-side rotation at all (see
  // `FencePostPlacement.rotationY`'s doc comment in farm-data.ts), not
  // anything about the rails or the post (x, z) placement math, which was
  // (and still is) verified symmetric across all 4 sides. South gets two
  // rail segments flanking the gate, mirroring how `buildFencePosts`
  // already skips posts within `farmGate.width` there — a single full-span
  // beam would run straight across the gate opening.
  const rails = useMemo(() => {
    const gateStart = farmGate.center[0] - farmGate.width / 2;
    const gateEnd = farmGate.center[0] + farmGate.width / 2;
    return [
      // North — unchanged from before, no gate on this side.
      { x: 0, z: -fenceHalfExtent, length: fenceHalfExtent * 2, rotated: false },
      // South — two segments, flanking the gate.
      { x: (-fenceHalfExtent + gateStart) / 2, z: fenceHalfExtent, length: gateStart - -fenceHalfExtent, rotated: false },
      { x: (gateEnd + fenceHalfExtent) / 2, z: fenceHalfExtent, length: fenceHalfExtent - gateEnd, rotated: false },
      // West / East — same full span as north, rotated 90° to run along Z.
      { x: -fenceHalfExtent, z: 0, length: fenceHalfExtent * 2, rotated: true },
      { x: fenceHalfExtent, z: 0, length: fenceHalfExtent * 2, rotated: true },
    ];
  }, []);

  return (
    <group>
      <instancedMesh ref={postRef} args={[fencePart.geometry, fencePart.material, fencePosts.length]} castShadow />
      {rails.map((rail, index) => (
        <mesh
          key={index}
          geometry={railGeometry}
          material={postMaterial}
          position={[rail.x, RAIL_HEIGHT, rail.z]}
          rotation={rail.rotated ? [0, Math.PI / 2, 0] : [0, 0, 0]}
          scale={[rail.length, 1, 1]}
        />
      ))}
      <mesh
        geometry={gatePostGeometry}
        material={gatePostMaterial}
        position={[farmGate.center[0] - farmGate.width / 2, 0.8, farmGate.center[1]]}
        castShadow
      />
      <mesh
        geometry={gatePostGeometry}
        material={gatePostMaterial}
        position={[farmGate.center[0] + farmGate.width / 2, 0.8, farmGate.center[1]]}
        castShadow
      />
    </group>
  );
}

/** New farm structure — a static prop near the pond, not selectable, no logic. */
function WaterTower() {
  const part = useModelPartAt(WATER_TOWER_MODEL_URL);
  const [x, z] = WATER_TOWER_POSITION;

  return (
    <mesh
      geometry={part.geometry}
      material={part.material}
      position={[x, 0, z]}
      scale={WATER_TOWER_MODEL_SCALE}
      castShadow
      receiveShadow
    />
  );
}
