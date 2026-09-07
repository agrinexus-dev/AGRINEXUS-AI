"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const DROP_COUNT = 420;
const FIELD_HALF_EXTENT = 34;
const FALL_SPEED = 16;
const TOP_Y = 22;
const BOTTOM_Y = 0.2;

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rainy-weather visual only (009C.6): thin falling streaks over the farm,
 * one `InstancedMesh` looping each drop from `TOP_Y` back to `TOP_Y` once it
 * passes `BOTTOM_Y`. CPU-updated instance matrices, same pattern `Environment`
 * already uses for swaying grass — no physics, no ground splash.
 */
export function Rain() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const drops = useMemo(() => {
    const random = seededRandom(707);
    return Array.from({ length: DROP_COUNT }, () => ({
      x: (random() - 0.5) * FIELD_HALF_EXTENT * 2,
      z: (random() - 0.5) * FIELD_HALF_EXTENT * 2,
      y: TOP_Y - random() * (TOP_Y - BOTTOM_Y),
      speed: FALL_SPEED * (0.85 + random() * 0.3),
    }));
  }, []);

  const geometry = useMemo(() => new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#cfe3f0", transparent: true, opacity: 0.45, fog: false }),
    [],
  );

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    drops.forEach((drop, index) => {
      drop.y -= drop.speed * delta;
      if (drop.y < BOTTOM_Y) drop.y = TOP_Y;

      dummy.position.set(drop.x, drop.y, drop.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, DROP_COUNT]} frustumCulled={false} />;
}
