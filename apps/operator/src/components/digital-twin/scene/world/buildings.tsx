"use client";

import { useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { useLiveContextStore } from "@/lib/aura/context/live-context-store";

import { buildings, type BuildingDefinition } from "../farm-data";
import type { SelectableEntity } from "../../types";
import { useModelPart, useModelScene } from "../use-model-part";

const WAREHOUSE_MODEL_URL = "/models/warehouse.glb";
const WAREHOUSE_MODEL_SCALE = 2.6;
useGLTF.preload(WAREHOUSE_MODEL_URL);

const SMALL_BUILDING_MODEL_URL = "/models/small-building.glb";
// Raw model height is ~0.88m; each instance is scaled to match its own
// building's existing declared `height`, so storage-shed/equipment-area keep
// the sizes farm-data already assigns them.
const SMALL_BUILDING_RAW_HEIGHT = 0.88;
useGLTF.preload(SMALL_BUILDING_MODEL_URL);

const BARN_MODEL_URL = "/models/barn.glb";
// Raw (hierarchy-aware) height is ~6.01m; scaled to match the warehouse's
// declared 4.2m height so it doesn't dwarf the rest of the building row.
const BARN_MODEL_SCALE = 0.7;
const BARN_POSITION: [number, number] = [29, 16];
useGLTF.preload(BARN_MODEL_URL);

export interface BuildingsProps {
  selectedId: string | null;
  onSelect: (entity: SelectableEntity) => void;
}

/** Real GLB models throughout (see `use-model-part.ts`) — no more box-composed placeholders. */
export function Buildings({ selectedId, onSelect }: BuildingsProps) {
  return (
    <>
      {buildings.map((building) =>
        building.kind === "warehouse" ? (
          <WarehouseBuilding key={building.id} building={building} selected={selectedId === building.id} onSelect={onSelect} />
        ) : (
          <SmallBuilding key={building.id} building={building} selected={selectedId === building.id} onSelect={onSelect} />
        ),
      )}
      <Barn selected={selectedId === "barn"} onSelect={onSelect} />
    </>
  );
}

interface WarehouseBuildingProps {
  building: BuildingDefinition;
  selected: boolean;
  onSelect: (entity: SelectableEntity) => void;
}

/** The one real-asset building this change (see approved-scope minimum list) — a real GLB, not the shared box geometry. */
function WarehouseBuilding({ building, selected, onSelect }: WarehouseBuildingProps) {
  const [hovered, setHovered] = useState(false);
  const [cx, cz] = building.center;
  const { geometry, material } = useModelPart(WAREHOUSE_MODEL_URL);
  const indicatorActive = selected || hovered;

  const ringGeometry = useMemo(() => new THREE.RingGeometry(building.size[0] * 0.62, building.size[0] * 0.68, 32), [building.size]);
  const ringMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#5b7a9e", transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    [],
  );

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect({
      id: building.id,
      type: "building",
      label: building.label,
      meta: `${kindLabel(building.kind)} · ${building.size[0]}m × ${building.size[1]}m`,
    });
  }

  return (
    <group
      position={[cx, 0, cz]}
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
        useLiveContextStore.getState().publishHover({ id: building.id, type: "building", label: building.label });
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
        useLiveContextStore.getState().publishHover(null);
      }}
    >
      <mesh geometry={geometry} material={material} scale={WAREHOUSE_MODEL_SCALE} castShadow receiveShadow />
      {indicatorActive ? (
        <mesh geometry={ringGeometry} material={ringMaterial} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      ) : null}
    </group>
  );
}

interface SmallBuildingProps {
  building: BuildingDefinition;
  selected: boolean;
  onSelect: (entity: SelectableEntity) => void;
}

/** Storage-shed / equipment-area buildings — real GLB, scaled per-instance to match each building's existing declared height. */
function SmallBuilding({ building, selected, onSelect }: SmallBuildingProps) {
  const [hovered, setHovered] = useState(false);
  const [cx, cz] = building.center;
  const [width, depth] = building.size;
  const { scene: modelScene, groundOffset } = useModelScene(SMALL_BUILDING_MODEL_URL);
  const scale = building.height / SMALL_BUILDING_RAW_HEIGHT;
  const indicatorActive = selected || hovered;

  const ringGeometry = useMemo(() => new THREE.RingGeometry(width * 0.55, width * 0.6, 28), [width]);
  const ringMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#5b7a9e", transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    [],
  );

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect({
      id: building.id,
      type: "building",
      label: building.label,
      meta: `${kindLabel(building.kind)} · ${width}m × ${depth}m`,
    });
  }

  return (
    <group
      position={[cx, 0, cz]}
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
        useLiveContextStore.getState().publishHover({ id: building.id, type: "building", label: building.label });
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
        useLiveContextStore.getState().publishHover(null);
      }}
    >
      <primitive object={modelScene} scale={scale} position={[0, groundOffset * scale, 0]} />
      {indicatorActive ? (
        <mesh geometry={ringGeometry} material={ringMaterial} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      ) : null}
    </group>
  );
}

interface BarnProps {
  selected: boolean;
  onSelect: (entity: SelectableEntity) => void;
}

/** New farm building — not part of farm-data.ts; a locally-positioned addition to the existing building row, selectable like the rest. */
function Barn({ selected, onSelect }: BarnProps) {
  const [hovered, setHovered] = useState(false);
  const [x, z] = BARN_POSITION;
  const { scene: modelScene, groundOffset } = useModelScene(BARN_MODEL_URL);
  const indicatorActive = selected || hovered;

  const ringGeometry = useMemo(() => new THREE.RingGeometry(3.4, 3.7, 32), []);
  const ringMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#5b7a9e", transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    [],
  );

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect({ id: "barn", type: "building", label: "Barn", meta: "Barn · 5.4m × 5.8m" });
  }

  return (
    <group
      position={[x, 0, z]}
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
        useLiveContextStore.getState().publishHover({ id: "barn", type: "building", label: "Barn" });
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
        useLiveContextStore.getState().publishHover(null);
      }}
    >
      <primitive object={modelScene} scale={BARN_MODEL_SCALE} position={[0, groundOffset * BARN_MODEL_SCALE, 0]} />
      {indicatorActive ? (
        <mesh geometry={ringGeometry} material={ringMaterial} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      ) : null}
    </group>
  );
}

function kindLabel(kind: BuildingDefinition["kind"]): string {
  switch (kind) {
    case "warehouse":
      return "Warehouse";
    case "storage-shed":
      return "Storage Shed";
    case "equipment-area":
      return "Equipment Area";
  }
}
