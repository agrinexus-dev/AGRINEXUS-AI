"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { diseaseRiskByPlot, RISK_COLORS } from "./intelligence-data";
import { useFadeOpacity } from "./use-fade-opacity";

const OVERLAY_Y = 0.06;
const HOTSPOT_Y = 0.09;
const MAX_OPACITY = 0.5;
const HOTSPOT_MAX_OPACITY = 0.9;

export interface DiseaseRiskOverlayProps {
  active: boolean;
}

const hotspotPlots = diseaseRiskByPlot.filter((plot) => plot.hotspot);

/** Disease Risk overlay: one flat color per plot (instanced, single draw call) plus a pulsing ring marker over each plot's simulated hotspot. Random simulation only — no AI, no real detection. */
export function DiseaseRiskOverlay({ active }: DiseaseRiskOverlayProps) {
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
    // See `crop-health-overlay.tsx` — baked per-instance so it applies
    // before each instance's own translation, instead of rotating the
    // whole already-positioned arrangement via an object-level `rotation`.
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const color = new THREE.Color();

    diseaseRiskByPlot.forEach((plot, index) => {
      matrix.compose(
        new THREE.Vector3(plot.center[0], OVERLAY_Y, plot.center[1]),
        quaternion,
        new THREE.Vector3(plot.size[0] * 0.96, plot.size[1] * 0.96, 1),
      );
      mesh.setMatrixAt(index, matrix);
      color.set(RISK_COLORS[plot.level]);
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  useFadeOpacity(active, [material], MAX_OPACITY);

  const ringGeometry = useMemo(() => new THREE.RingGeometry(1, 1.35, 24), []);
  const hotspotMaterials = useMemo(
    () =>
      hotspotPlots.map(
        (plot) =>
          new THREE.MeshBasicMaterial({
            color: RISK_COLORS[plot.level],
            transparent: true,
            opacity: 0,
            depthWrite: false,
            toneMapped: false,
          }),
      ),
    [],
  );
  useFadeOpacity(active, hotspotMaterials, HOTSPOT_MAX_OPACITY);

  return (
    <group>
      <instancedMesh ref={meshRef} args={[geometry, material, diseaseRiskByPlot.length]} frustumCulled={false} />
      {hotspotPlots.map((plot, index) => {
        const hotspotMaterial = hotspotMaterials[index];
        if (!plot.hotspot || !hotspotMaterial) return null;
        return (
          <mesh
            key={plot.plotId}
            geometry={ringGeometry}
            material={hotspotMaterial}
            position={[plot.hotspot[0], HOTSPOT_Y, plot.hotspot[1]]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        );
      })}
    </group>
  );
}
