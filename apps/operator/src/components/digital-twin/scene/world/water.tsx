"use client";

import { useMemo } from "react";
import * as THREE from "three";

import { canal, canalBridge, pond } from "../farm-data";

const WATER_COLOR = "#2f7fa6";
const BRIDGE_COLOR = "#7a6650";

/** Pond + irrigation canal, with a simple deck where the canal crosses the south road arm. No shader-based water simulation — brighter, more reflective daylight blue instead of the old near-black tone. */
export function Water() {
  const waterMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: WATER_COLOR,
        roughness: 0.12,
        metalness: 0.35,
        envMapIntensity: 1.2,
      }),
    [],
  );
  const bridgeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: BRIDGE_COLOR, roughness: 0.75 }), []);

  const pondGeometry = useMemo(() => new THREE.CircleGeometry(pond.radius, 24), []);
  const canalGeometry = useMemo(() => new THREE.PlaneGeometry(canal.halfLength * 2, canal.width), []);
  const bridgeGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  return (
    <group>
      <mesh
        geometry={pondGeometry}
        material={waterMaterial}
        position={[pond.center[0], 0.01, pond.center[1]]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      <mesh
        geometry={canalGeometry}
        material={waterMaterial}
        position={[0, 0.01, canal.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      <mesh
        geometry={bridgeGeometry}
        material={bridgeMaterial}
        position={[canalBridge.center[0], 0.05, canalBridge.center[1]]}
        scale={[canalBridge.size[0], canalBridge.size[1], 1]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      />
    </group>
  );
}
