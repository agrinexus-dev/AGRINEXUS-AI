"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { cropHealthCells, HEALTH_COLORS } from "./intelligence-data";
import { useFadeOpacity } from "./use-fade-opacity";

const OVERLAY_Y = 0.05;
const MAX_OPACITY = 0.62;

export interface CropHealthOverlayProps {
  active: boolean;
}

/**
 * Crop Health overlay: one instanced quad per health cell (see
 * `intelligence-data.ts`), colored via per-instance vertex color — a single
 * draw call regardless of cell count. Geometry/material/instance matrices
 * are all built once; toggling the layer only fades `material.opacity`
 * (see `useFadeOpacity`), it never rebuilds the mesh.
 */
export function CropHealthOverlay({ active }: CropHealthOverlayProps) {
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

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    // Baked into every instance instead of a `rotation` prop on the
    // `<instancedMesh>` itself: an object-level rotation only rotates
    // matrixWorld, which is applied *after* each instance's own matrix, so
    // it would rotate the whole *arrangement* of already-ground-flat
    // instances around the origin (sending each cell's world Y to its Z
    // coordinate and vice versa) instead of tipping each flat quad to face
    // up in place. Baking the rotation into the per-instance quaternion
    // applies it before the instance's translation, which is what actually
    // lays each quad flat at its own (x, y, z).
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const color = new THREE.Color();

    cropHealthCells.forEach((cell, index) => {
      matrix.compose(
        new THREE.Vector3(cell.center[0], OVERLAY_Y, cell.center[1]),
        quaternion,
        new THREE.Vector3(cell.size[0], cell.size[1], 1),
      );
      mesh.setMatrixAt(index, matrix);
      color.set(HEALTH_COLORS[cell.status]);
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  useFadeOpacity(active, [material], MAX_OPACITY);

  return <instancedMesh ref={meshRef} args={[geometry, material, cropHealthCells.length]} frustumCulled={false} />;
}
