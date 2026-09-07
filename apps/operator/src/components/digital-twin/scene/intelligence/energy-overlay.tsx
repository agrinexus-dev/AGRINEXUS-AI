"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { Panel, Typography } from "@agrinexus/ui";

import { baseEnergyStats, energyNodes } from "./intelligence-data";
import { buildStripGeometry } from "./ground-strip";
import { useFadeOpacity } from "./use-fade-opacity";

const FLOW_Y = 0.26;
const FLOW_WIDTH = 0.45;
const MAX_OPACITY = 1;
const PARTICLE_SPEED = 0.45;
const PARTICLES_PER_PATH = 2;
const FLOW_COLOR = "#f6c945";
const STATS_INTERVAL_MS = 1500;

export interface EnergyOverlayProps {
  active: boolean;
}

const paths: { from: [number, number]; to: [number, number] }[] = [
  { from: energyNodes.solar, to: energyNodes.battery },
  ...energyNodes.consumers.map((consumer) => ({ from: energyNodes.battery, to: consumer })),
];

/**
 * Energy overlay: reuses the existing Solar Array / charging-pad positions
 * (see `intelligence-data.ts`), draws a power-flow path from the array to a
 * simulated battery node and out to each consumer, with a few particles
 * drifting along each path. A small floating readout shows placeholder
 * generation/consumption/battery numbers — gently varying over time via a
 * slow `setInterval`, not per-frame React state.
 */
export function EnergyOverlay({ active }: EnergyOverlayProps) {
  const strips = useMemo(
    () => paths.map((path, index) => ({ id: `energy-path-${index}`, geometry: buildStripGeometry(path.from, path.to, FLOW_WIDTH, FLOW_Y) })),
    [],
  );
  const stripMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: FLOW_COLOR, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    [],
  );

  const solarRingGeometry = useMemo(() => new THREE.RingGeometry(1.3, 1.55, 32), []);
  const solarRingMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: FLOW_COLOR, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false }),
    [],
  );
  const batteryGeometry = useMemo(() => new THREE.CylinderGeometry(0.4, 0.4, 0.9, 8), []);
  const batteryMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#2fae4a",
        emissive: "#2fae4a",
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0,
        toneMapped: false,
      }),
    [],
  );

  useFadeOpacity(active, [stripMaterial, solarRingMaterial, batteryMaterial], MAX_OPACITY);

  const particleRef = useRef<THREE.InstancedMesh>(null);
  const particleGeometry = useMemo(() => new THREE.SphereGeometry(0.12, 8, 8), []);
  const particleMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: FLOW_COLOR, transparent: true, opacity: 0, toneMapped: false }),
    [],
  );
  useFadeOpacity(active, [particleMaterial], 0.95);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const start = useMemo(() => new THREE.Vector3(), []);
  const end = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const mesh = particleRef.current;
    if (!mesh) return;

    let index = 0;
    paths.forEach((path) => {
      start.set(path.from[0], FLOW_Y, path.from[1]);
      end.set(path.to[0], FLOW_Y, path.to[1]);
      for (let i = 0; i < PARTICLES_PER_PATH; i += 1) {
        const t = (clock.elapsedTime * PARTICLE_SPEED + i / PARTICLES_PER_PATH) % 1;
        dummy.position.lerpVectors(start, end, t);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  const [stats, setStats] = useState(baseEnergyStats);

  useEffect(() => {
    if (!active) return;

    function tick() {
      const t = performance.now() / 1000;
      setStats({
        generationKw: Math.round((baseEnergyStats.generationKw + Math.sin(t * 0.3) * 0.6) * 10) / 10,
        consumptionKw: Math.round((baseEnergyStats.consumptionKw + Math.cos(t * 0.24) * 0.4) * 10) / 10,
        batteryPercent: baseEnergyStats.batteryPercent,
      });
    }

    tick();
    const interval = setInterval(tick, STATS_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <group>
      {strips.map((strip) => (
        <mesh key={strip.id} geometry={strip.geometry} material={stripMaterial} />
      ))}
      <instancedMesh
        ref={particleRef}
        args={[particleGeometry, particleMaterial, paths.length * PARTICLES_PER_PATH]}
        frustumCulled={false}
      />
      <mesh
        geometry={solarRingGeometry}
        material={solarRingMaterial}
        position={[energyNodes.solar[0], 0.05, energyNodes.solar[1]]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      <mesh geometry={batteryGeometry} material={batteryMaterial} position={[energyNodes.battery[0], 0.45, energyNodes.battery[1]]} />
      {active ? (
        <Html position={[energyNodes.solar[0], 2.4, energyNodes.solar[1]]} center distanceFactor={12} zIndexRange={[20, 0]}>
          <Panel variant="glass" padding="sm" className="flex w-48 flex-col gap-1.5 shadow-elevated">
            <Typography variant="caption">Energy</Typography>
            <StatRow label="Generation" value={`${stats.generationKw.toFixed(1)} kW`} />
            <StatRow label="Consumption" value={`${stats.consumptionKw.toFixed(1)} kW`} />
            <StatRow label="Battery" value={`${stats.batteryPercent}%`} />
          </Panel>
        </Html>
      ) : null}
    </group>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Typography variant="caption" className="text-foreground-subtle">
        {label}
      </Typography>
      <Typography variant="small" className="text-foreground">
        {value}
      </Typography>
    </div>
  );
}
