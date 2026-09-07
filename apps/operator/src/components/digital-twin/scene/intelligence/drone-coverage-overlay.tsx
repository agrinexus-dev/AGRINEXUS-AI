"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { COVERAGE_COLORS, droneCoverageCells } from "./intelligence-data";
import { useFadeOpacity } from "./use-fade-opacity";

const CELL_Y = 0.07;
const RING_Y = 0.1;
const MAX_OPACITY = 0.5;
const SCAN_INTERVAL_SECONDS = 3.5;

export interface DroneCoverageOverlayProps {
  active: boolean;
}

/**
 * Drone Coverage overlay: a coarse completed/pending grid (see
 * `intelligence-data.ts`), plus a self-contained "current scan" cell that
 * slowly cycles over time. This animation is NOT wired to the real Drone or
 * its patrol route — overlay-only, no live telemetry, per this change's
 * scope (Autonomous Systems / Patrol Logic are frozen).
 */
export function DroneCoverageOverlay({ active }: DroneCoverageOverlayProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const cellColors = useMemo(
    () => droneCoverageCells.map((cell) => new THREE.Color(cell.completed ? COVERAGE_COLORS.completed : COVERAGE_COLORS.pending)),
    [],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    // See `crop-health-overlay.tsx` — baked per-instance so it applies
    // before each instance's own translation, instead of rotating the
    // whole already-positioned arrangement via an object-level `rotation`.
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

    droneCoverageCells.forEach((cell, index) => {
      matrix.compose(
        new THREE.Vector3(cell.center[0], CELL_Y, cell.center[1]),
        quaternion,
        new THREE.Vector3(cell.size[0], cell.size[1], 1),
      );
      mesh.setMatrixAt(index, matrix);
      const color = cellColors[index];
      if (color) mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cellColors]);

  useFadeOpacity(active, [material], MAX_OPACITY);

  const [scanIndex, setScanIndex] = useState(0);
  const lastScanIndex = useRef(-1);
  const scanningColor = useMemo(() => new THREE.Color(COVERAGE_COLORS.scanning), []);

  useFrame(({ clock }) => {
    if (!active) return;
    const index = Math.floor(clock.elapsedTime / SCAN_INTERVAL_SECONDS) % droneCoverageCells.length;
    if (index === lastScanIndex.current) return;

    const mesh = meshRef.current;
    if (mesh) {
      if (lastScanIndex.current >= 0) {
        const previousColor = cellColors[lastScanIndex.current];
        if (previousColor) mesh.setColorAt(lastScanIndex.current, previousColor);
      }
      mesh.setColorAt(index, scanningColor);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    lastScanIndex.current = index;
    setScanIndex(index);
  });

  const ringGeometry = useMemo(() => new THREE.RingGeometry(1.6, 1.9, 28), []);
  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: COVERAGE_COLORS.scanning,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );
  useFadeOpacity(active, [ringMaterial], 0.9);

  const scanCell = droneCoverageCells[scanIndex];

  return (
    <group>
      <instancedMesh ref={meshRef} args={[geometry, material, droneCoverageCells.length]} frustumCulled={false} />
      {scanCell ? (
        <mesh
          geometry={ringGeometry}
          material={ringMaterial}
          position={[scanCell.center[0], RING_Y, scanCell.center[1]]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      ) : null}
    </group>
  );
}
