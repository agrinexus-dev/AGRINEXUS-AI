"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { useLiveContextStore } from "@/lib/aura/context/live-context-store";

import { farmPlots, type CropGrowthStage, type FarmPlotDefinition } from "./farm-data";
import type { SelectableEntity } from "../types";
import { useModelPartAt } from "./use-model-part";

const STAGE_COLOR: Record<CropGrowthStage, string> = {
  seedling: "#6f9a52",
  growing: "#7fbb52",
  mature: "#a8d95c",
  fallow: "#b39b6f",
};

const STAGE_LABEL: Record<CropGrowthStage, string> = {
  seedling: "Seedling",
  growing: "Growing",
  mature: "Mature",
  fallow: "Fallow",
};

const FIELD_INSET = 0.6;

const WHEAT_FIELD_MODEL_URL = "/models/wheat-field.glb";
// Raw stalk height is ~13.4m — scaling the whole clump to fill a 20m plot's
// footprint (this model's original approach here) also blows the height up
// to ~30m+, towering over the water tower. Scaled instead to a ~3m clump
// height (tall but plausible next to the rest of the scene) and scattered
// as several clumps across the plot, the same "realistic size, not
// distorted to fill the plot" treatment as the growing-stage crops below.
const WHEAT_FIELD_RAW_HEIGHT = 13.446;
const WHEAT_CLUMP_SCALE = 3 / WHEAT_FIELD_RAW_HEIGHT;
const WHEAT_CLUMP_COUNT = 10;
useGLTF.preload(WHEAT_FIELD_MODEL_URL);

const CROPS_MODEL_URL = "/models/crops.glb";
// crops.glb is a small fixed dirt + 5-vegetable-type diorama (lettuce, a red
// crop, green, orange, watermelon, all baked into one model), not a single
// generic "one crop type" prefab — there's no per-plot crop-type match here.
// Used as generic "something is growing" texture: a handful of small patches
// scattered across "growing" plots at a realistic absolute size, not
// stretched to fill the whole 20m plot (which would look like a giant
// distorted vegetable patch).
const CROPS_PATCH_SCALE = 0.8;
const GROWING_PATCH_COUNT = 6;
useGLTF.preload(CROPS_MODEL_URL);

export interface CropsProps {
  selectedId: string | null;
  onSelect: (entity: SelectableEntity) => void;
}

/** Filled, colored fields on top of `FarmPlots`' boundary outlines — same source data, a different presentation layer. */
export function Crops({ selectedId, onSelect }: CropsProps) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  return (
    <>
      {farmPlots.map((plot) => (
        <CropField key={plot.id} plot={plot} geometry={geometry} selected={selectedId === plot.id} onSelect={onSelect} />
      ))}
    </>
  );
}

interface CropFieldProps {
  plot: (typeof farmPlots)[number];
  geometry: THREE.PlaneGeometry;
  selected: boolean;
  onSelect: (entity: SelectableEntity) => void;
}

function CropField({ plot, geometry, selected, onSelect }: CropFieldProps) {
  const [hovered, setHovered] = useState(false);
  const [cx, cz] = plot.center;
  const [width, depth] = plot.size;
  const baseColor = STAGE_COLOR[plot.growthStage];

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.85,
        metalness: 0,
        emissive: new THREE.Color(baseColor),
        emissiveIntensity: 0,
      }),
    [baseColor],
  );

  material.emissiveIntensity = selected ? 0.35 : hovered ? 0.18 : 0;

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect({
      id: plot.id,
      type: "field",
      label: plot.label,
      meta: `${STAGE_LABEL[plot.growthStage]} · ${width}m × ${depth}m`,
    });
  }

  return (
    <group>
      <mesh
        geometry={geometry}
        material={material}
        position={[cx, 0.018, cz]}
        scale={[width - FIELD_INSET, depth - FIELD_INSET, 1]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={handleClick}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
          useLiveContextStore.getState().publishHover({ id: plot.id, type: "field", label: plot.label });
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
          useLiveContextStore.getState().publishHover(null);
        }}
      />
      {/* Non-interactive 3D dressing layered on top — clicks/hover still resolve against the plane above. */}
      {plot.growthStage === "mature" ? <MatureWheatOverlay plot={plot} /> : null}
      {plot.growthStage === "growing" ? <GrowingCropsOverlay plot={plot} /> : null}
    </group>
  );
}

/**
 * One `instancedMesh` per overlay instead of N separate `<mesh>` elements
 * (a draw-call optimization) — same technique `trees.tsx` already
 * established (static placements, matrices built once via `useEffect`, not
 * `useFrame`, since these clumps never move). Geometry/material were already
 * shared via `useModelPartAt`'s memoization before this change; this only
 * removes the per-clump draw call, collapsing up to `WHEAT_CLUMP_COUNT` (10)
 * or `GROWING_PATCH_COUNT` (6) draw calls per affected plot into 1. No
 * visual change — same positions, same fixed scale, same geometry/material.
 */
function useStaticInstances(positions: [number, number][], y: number, scale: number) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    positions.forEach(([x, z], index) => {
      matrix.compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(scale, scale, scale));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [positions, y, scale]);

  return meshRef;
}

function MatureWheatOverlay({ plot }: { plot: FarmPlotDefinition }) {
  const part = useModelPartAt(WHEAT_FIELD_MODEL_URL);

  const positions = useMemo(
    () => scatterInPlot(hashSeed(plot.id) ^ 0x5bd1e995, WHEAT_CLUMP_COUNT, plot.center, plot.size, FIELD_INSET + 2),
    [plot.id, plot.center, plot.size],
  );
  const meshRef = useStaticInstances(positions, 0.02, WHEAT_CLUMP_SCALE);

  return <instancedMesh ref={meshRef} args={[part.geometry, part.material, positions.length]} />;
}

function GrowingCropsOverlay({ plot }: { plot: FarmPlotDefinition }) {
  const part = useModelPartAt(CROPS_MODEL_URL);

  const positions = useMemo(
    () => scatterInPlot(hashSeed(plot.id), GROWING_PATCH_COUNT, plot.center, plot.size, FIELD_INSET + 1),
    [plot.id, plot.center, plot.size],
  );
  const meshRef = useStaticInstances(positions, 0.02, CROPS_PATCH_SCALE);

  return <instancedMesh ref={meshRef} args={[part.geometry, part.material, positions.length]} />;
}

/** Deterministic pseudo-random generator (mulberry32) — same algorithm `farm-data.ts` uses, kept local here so that file stays untouched. */
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

function hashSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return hash;
}

function scatterInPlot(
  seed: number,
  count: number,
  center: [number, number],
  size: [number, number],
  margin: number,
): [number, number][] {
  const random = seededRandom(seed);
  const [cx, cz] = center;
  const [width, depth] = size;
  const positions: [number, number][] = [];

  for (let i = 0; i < count; i += 1) {
    const x = cx + (random() - 0.5) * Math.max(width - margin * 2, 0);
    const z = cz + (random() - 0.5) * Math.max(depth - margin * 2, 0);
    positions.push([x, z]);
  }

  return positions;
}
