"use client";

import { useMemo, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { useLiveContextStore } from "@/lib/aura/context/live-context-store";

import { roadSpurs } from "./farm-data";
import type { SelectableEntity } from "../types";

const ROAD_LENGTH = 60;
const ROAD_WIDTH = 3;

export interface RoadsProps {
  selectedId: string | null;
  onSelect: (entity: SelectableEntity) => void;
}

/**
 * The main road cross plus short spurs reaching the yard/building cluster.
 * Treated as a single selectable "Road Network" entity — splitting the
 * shared-geometry cross into individually-selectable segments would multiply
 * draw calls for no real benefit at this change's fidelity.
 */
export function Roads({ selectedId, onSelect }: RoadsProps) {
  const [hovered, setHovered] = useState(false);
  const selected = selectedId === "road-network";

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#5c6068",
        roughness: 0.8,
        metalness: 0.05,
        emissive: new THREE.Color("#5b7a9e"),
        emissiveIntensity: 0,
      }),
    [],
  );
  material.emissiveIntensity = selected ? 0.3 : hovered ? 0.15 : 0;

  const horizontalGeometry = useMemo(() => new THREE.PlaneGeometry(ROAD_LENGTH, ROAD_WIDTH), []);
  const verticalGeometry = useMemo(() => new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH), []);
  const spurGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect({ id: "road-network", type: "road", label: "Road Network", meta: "Farm road network · 2 intersections" });
  }

  return (
    <group
      position={[0, 0.015, 0]}
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
        useLiveContextStore.getState().publishHover({ id: "road-network", type: "road", label: "Road Network" });
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
        useLiveContextStore.getState().publishHover(null);
      }}
    >
      <mesh geometry={horizontalGeometry} material={material} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
      <mesh geometry={verticalGeometry} material={material} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
      {roadSpurs.map((spur) => (
        <mesh
          key={spur.id}
          geometry={spurGeometry}
          material={material}
          position={[spur.center[0], 0, spur.center[1]]}
          scale={[spur.size[0], spur.size[1], 1]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        />
      ))}
    </group>
  );
}
