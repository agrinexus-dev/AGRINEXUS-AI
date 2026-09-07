"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { cloudPlacements, grassBladePlacements, type CloudPlacement } from "../farm-data";
import { WEATHER_PRESETS, type WeatherPreset } from "../weather";

const GRASS_COLOR = "#4f7a3f";
const CLOUD_COLOR = "#ffffff";
const WRAP_LIMIT = 40;
// Lifts every cloud a bit higher (011) for a grander, more "high in the
// sky" feel — comfortably clear of the tallest horizon silhouette (~16
// units, see `Horizon`) with margin to spare, so they can never read as
// intersecting the terrain or hills.
const CLOUD_ALTITUDE_BOOST = 6;

export interface EnvironmentProps {
  weather: WeatherPreset;
}

/**
 * Lightweight ambient motion: swaying grass (CPU-updated instance matrices,
 * one draw call — the same `InstancedMesh` + `setMatrixAt` approach `Trees`
 * already uses, just called every frame instead of once) and a handful of
 * drifting clouds, whose density/opacity respond to the active weather
 * preset. No per-vertex shader work, no per-frame allocation.
 */
export function Environment({ weather }: EnvironmentProps) {
  return (
    <group>
      <AnimatedGrass />
      <Clouds weather={weather} />
    </group>
  );
}

// Throttles the grass sway update to every 3rd frame (~20 fps-equivalent
// update rate; the mesh itself still renders every frame — the CPU update
// loop below just doesn't recompute all 260 instance matrices as often).
// This loop was recomputing a sine + full instance
// matrix for `grassBladePlacements.length` (260) blades on EVERY frame,
// unconditionally (`Environment` always mounts), for a purely decorative,
// low-amplitude (±0.12 rad) sway — exactly the "decorative movement that
// shouldn't consume the same rendering budget as operational objects" case
// this prompt calls out. At this sway frequency (1.4 rad/s) the visual
// difference between updating every frame vs. every 3rd frame is
// imperceptible, while cutting this component's per-frame CPU cost by
// ~3x. Drone/robot movement, camera controls, and mission visualization
// are untouched — they each own their own `useFrame` and were not part of
// this loop.
const GRASS_UPDATE_EVERY_N_FRAMES = 3;

function AnimatedGrass() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const frameCounter = useRef(0);

  const geometry = useMemo(() => {
    const blade = new THREE.PlaneGeometry(0.12, 0.5);
    blade.translate(0, 0.25, 0); // pivot at the base so sway bends from the ground, not the middle
    return blade;
  }, []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: GRASS_COLOR, roughness: 1, side: THREE.DoubleSide }),
    [],
  );

  useFrame(({ clock }) => {
    frameCounter.current += 1;
    if (frameCounter.current % GRASS_UPDATE_EVERY_N_FRAMES !== 0) return;

    const mesh = meshRef.current;
    if (!mesh) return;

    const t = clock.elapsedTime;
    grassBladePlacements.forEach(({ position: [x, , z], rotationY, phase }, index) => {
      const sway = Math.sin(t * 1.4 + phase) * 0.12;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(sway, rotationY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, grassBladePlacements.length]}
      frustumCulled={false}
    />
  );
}

function Clouds({ weather }: EnvironmentProps) {
  const config = WEATHER_PRESETS[weather];
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 10, 8), []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: CLOUD_COLOR,
        roughness: 1,
        transparent: true,
        opacity: config.cloudOpacity,
        // Camera panning (009D.5) lets the camera get close enough to pass
        // through a cloud puff; without DoubleSide the sphere's back faces
        // are culled and it vanishes entirely from inside instead of just
        // reading as fog.
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  material.opacity = config.cloudOpacity;

  return (
    <>
      {cloudPlacements.map((cloud) => (
        <Cloud key={cloud.id} cloud={cloud} geometry={geometry} material={material} cloudScale={config.cloudScale} />
      ))}
    </>
  );
}

function Cloud({
  cloud,
  geometry,
  material,
  cloudScale,
}: {
  cloud: CloudPlacement;
  geometry: THREE.SphereGeometry;
  material: THREE.MeshStandardMaterial;
  cloudScale: number;
}) {
  const ref = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    group.position.x += delta * cloud.speed;
    if (group.position.x > WRAP_LIMIT) group.position.x = -WRAP_LIMIT;
  });

  const s = cloud.scale * cloudScale;

  // Five overlapping puffs instead of the old flat side-by-side three — two
  // stacked upward (011) give the silhouette actual cumulus-style volume
  // ("toy-like" before was really "flat"), still plain spheres and still
  // just a handful of extra draw calls per cloud.
  return (
    <group ref={ref} position={[cloud.startX, cloud.y + CLOUD_ALTITUDE_BOOST, cloud.z]}>
      <mesh geometry={geometry} material={material} scale={[s, s * 0.55, s * 0.8]} frustumCulled={false} />
      <mesh
        geometry={geometry}
        material={material}
        position={[s * 0.55, s * 0.08, 0]}
        scale={[s * 0.65, s * 0.42, s * 0.6]}
        frustumCulled={false}
      />
      <mesh
        geometry={geometry}
        material={material}
        position={[-s * 0.5, s * 0.05, 0]}
        scale={[s * 0.6, s * 0.4, s * 0.55]}
        frustumCulled={false}
      />
      <mesh
        geometry={geometry}
        material={material}
        position={[0, s * 0.4, s * 0.05]}
        scale={[s * 0.7, s * 0.48, s * 0.62]}
        frustumCulled={false}
      />
      <mesh
        geometry={geometry}
        material={material}
        position={[s * 0.18, s * 0.58, -s * 0.12]}
        scale={[s * 0.42, s * 0.32, s * 0.36]}
        frustumCulled={false}
      />
    </group>
  );
}
