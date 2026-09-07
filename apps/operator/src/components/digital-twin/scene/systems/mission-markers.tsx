"use client";

import { useMemo } from "react";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";

import { missionMarkers, type MissionMarkerKind } from "../farm-data";

const MARKER_COLOR: Record<MissionMarkerKind, string> = {
  inspection: "#5b9bd5",
  warning: "#f6ad55",
  completed: "#4fae7a",
};

const MARKER_HEIGHT = 2.4;

/**
 * Static, non-interactive placeholder markers — no click handling, no
 * animation beyond the camera-facing billboard Drei already provides.
 */
export function MissionMarkers() {
  const geometry = useMemo(() => new THREE.OctahedronGeometry(0.35, 0), []);
  const poleGeometry = useMemo(() => new THREE.CylinderGeometry(0.02, 0.02, MARKER_HEIGHT, 6), []);
  const poleMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4a5058", roughness: 0.8 }), []);

  const markerMaterials = useMemo(() => {
    const entries = (Object.keys(MARKER_COLOR) as MissionMarkerKind[]).map((kind) => [
      kind,
      new THREE.MeshStandardMaterial({ color: MARKER_COLOR[kind], emissive: MARKER_COLOR[kind], emissiveIntensity: 0.6, roughness: 0.35 }),
    ] as const);
    return Object.fromEntries(entries) as Record<MissionMarkerKind, THREE.MeshStandardMaterial>;
  }, []);

  return (
    <>
      {missionMarkers.map((marker) => (
        <group key={marker.id} position={[marker.position[0], 0, marker.position[1]]}>
          <mesh geometry={poleGeometry} material={poleMaterial} position={[0, MARKER_HEIGHT / 2, 0]} />
          <Billboard position={[0, MARKER_HEIGHT, 0]}>
            <mesh geometry={geometry} material={markerMaterials[marker.kind]} />
          </Billboard>
        </group>
      ))}
    </>
  );
}
