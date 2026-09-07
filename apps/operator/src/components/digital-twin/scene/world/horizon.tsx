"use client";

import { useMemo } from "react";
import * as THREE from "three";

import { buildTerrainTexture } from "../terrain";
import { WEATHER_PRESETS, type WeatherPreset } from "../weather";

/** Deterministic pseudo-random generator (mulberry32), same approach as `farm-data.ts` — stable across renders, no `Math.random()`. */
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

interface RingPlacement {
  position: [number, number, number];
  scale: [number, number, number];
  rotationY: number;
}

function buildRing(radius: number, count: number, seed: number, heightRange: [number, number], radiusJitter: number): RingPlacement[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + random() * 0.2;
    const r = radius + (random() - 0.5) * radiusJitter;
    const height = heightRange[0] + random() * (heightRange[1] - heightRange[0]);
    const footprint = height * (0.7 + random() * 0.5);
    return {
      position: [Math.cos(angle) * r, 0, Math.sin(angle) * r],
      scale: [footprint, height, footprint],
      rotationY: random() * Math.PI * 2,
    };
  });
}

const FOUNDATION_RADIUS = 220;
// Tiles the same texture the real `Terrain` uses at a coarser repeat so the
// per-tile size on this much larger disc stays close to `Terrain`'s own
// (~64/6 ≈ 10.7 units/tile here vs ~11 units/tile there) — visually
// continuous instead of a smooth, flat, obviously-different ground kicking
// in right at `Terrain`'s edge.
const FOUNDATION_TEXTURE_REPEAT = 40;

interface GroundFoundationProps {
  weather: WeatherPreset;
}

/**
 * Large ground foundation (009D.8, reworked 011) beneath the farm and
 * horizon ring — the real `Terrain` is only a 64×64 patch, which left a
 * visible gap of empty space around/under it once the camera could pan or
 * tilt far enough to see past its edge. A single disc well past the
 * horizon's outer edge closes that gap; it reuses `Terrain`'s own mottled
 * texture and weather ground-tint (011) so it blends into the real
 * playable ground instead of reading as a flat, differently-colored ring,
 * and sits fractionally below `Terrain` (`y = 0`) so the two never z-fight.
 * Well past every preset's `fogFar`, so its own outer edge is always fully
 * fogged out rather than visible as a hard boundary.
 */
function GroundFoundation({ weather }: GroundFoundationProps) {
  const config = WEATHER_PRESETS[weather];
  const geometry = useMemo(() => new THREE.CircleGeometry(FOUNDATION_RADIUS, 48), []);
  const texture = useMemo(() => {
    const map = buildTerrainTexture();
    map.repeat.set(FOUNDATION_TEXTURE_REPEAT, FOUNDATION_TEXTURE_REPEAT);
    return map;
  }, []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0, fog: true }),
    [texture],
  );
  material.color.set(config.groundTint);

  return <mesh geometry={geometry} material={material} position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} />;
}

export interface HorizonProps {
  weather: WeatherPreset;
}

/**
 * Distant backdrop (009C.6 "Horizon", reworked 011) so the farm doesn't end
 * in empty space: a nearer low treeline, mid-distance rolling hills, a
 * loose scatter of small forest silhouettes, and a far, low rolling-hills
 * ring — each its own `InstancedMesh` (one draw call per layer) with
 * atmospheric-perspective coloring (paler/cooler with distance) so it reads
 * as depth rather than a wall. Purely decorative background — no shadows,
 * no collision, no interactivity.
 *
 * The far layer used to be a ring of 20–34-unit-tall cone "mountains",
 * which towered over the farm/buildings out of all proportion for a flat
 * agricultural setting (011 visual review). It's now the same low
 * hemisphere "hill" shape as the nearer `hills` ring, just farther out and
 * shorter, plus `scatteredForest` — small cone silhouettes spread across a
 * band overlapping both hill layers — so the horizon reads as gently
 * rolling countryside instead of a mountain wall.
 */
export function Horizon({ weather }: HorizonProps) {
  const treeline = useMemo(() => buildRing(46, 46, 101, [3, 6], 6), []);
  const hills = useMemo(() => buildRing(68, 20, 202, [8, 16], 10), []);
  const farHills = useMemo(() => buildRing(108, 18, 303, [5, 11], 18), []);
  const scatteredForest = useMemo(() => buildRing(100, 70, 404, [1.4, 3.2], 44), []);

  return (
    <group>
      <GroundFoundation weather={weather} />
      <HorizonRing placements={treeline} color="#2f4a34" geometryKind="cone" />
      <HorizonRing placements={hills} color="#5e7f72" geometryKind="hill" />
      <HorizonRing placements={scatteredForest} color="#264030" geometryKind="cone" />
      <HorizonRing placements={farHills} color="#93a99c" geometryKind="hill" />
    </group>
  );
}

interface HorizonRingProps {
  placements: RingPlacement[];
  color: string;
  geometryKind: "cone" | "hill";
}

function HorizonRing({ placements, color, geometryKind }: HorizonRingProps) {
  const geometry = useMemo(() => {
    if (geometryKind === "hill") return new THREE.SphereGeometry(0.6, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    return new THREE.ConeGeometry(0.6, 1, 7);
  }, [geometryKind]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 1,
        metalness: 0,
        fog: true,
        // This backdrop only has one shadow-casting key light (see
        // `lighting.tsx`) and no fill light reaching the far ring radii it
        // sits at — camera panning (009D.5) made it possible to end up
        // looking at a shadow-facing ridge, where ambient+hemisphere alone
        // crush this color to near-black. A low emissive floor keeps the
        // silhouette visibly its intended color from every angle instead of
        // reading as a stray dark blob.
        emissive: color,
        emissiveIntensity: 0.35,
      }),
    [color],
  );

  const meshRef = useMemo(() => {
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    placements.forEach((placement, index) => {
      euler.set(0, placement.rotationY, 0);
      quaternion.setFromEuler(euler);
      matrix.compose(
        new THREE.Vector3(...placement.position),
        quaternion,
        new THREE.Vector3(...placement.scale),
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }, [geometry, material, placements]);

  return <primitive object={meshRef} />;
}
