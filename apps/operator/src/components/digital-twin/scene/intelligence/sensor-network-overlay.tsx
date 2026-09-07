"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { X } from "lucide-react";
import * as THREE from "three";

import { IconButton, Panel, Typography } from "@agrinexus/ui";

import { sensors } from "./intelligence-data";
import { useFadeOpacity } from "./use-fade-opacity";

const POLE_HEIGHT = 1.1;
const HEAD_COLOR = "#38bdf8";
const RING_COLOR = "#38bdf8";
const MAX_OPACITY = 1;

export interface SensorNetworkOverlayProps {
  active: boolean;
}

/**
 * Sensor Network overlay: instanced pole+head markers (2 draw calls total,
 * regardless of sensor count), clickable via `event.instanceId`. Clicking a
 * sensor opens a small floating readout anchored at its position — this is
 * a fully self-contained interaction (local `useState`, a `drei/Html`
 * popup) and does NOT go through the app's Selection System/Details Panel,
 * per this change's "Selection System: do not touch".
 */
export function SensorNetworkOverlay({ active }: SensorNetworkOverlayProps) {
  const [openSensorId, setOpenSensorId] = useState<string | null>(null);

  useEffect(() => {
    if (!active) setOpenSensorId(null);
  }, [active]);

  const poleRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);

  const poleGeometry = useMemo(() => new THREE.CylinderGeometry(0.035, 0.045, POLE_HEIGHT, 6), []);
  const headGeometry = useMemo(() => new THREE.SphereGeometry(0.16, 12, 12), []);
  const poleMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#4a4f57", roughness: 0.7, transparent: true, opacity: 0 }),
    [],
  );
  const headMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: HEAD_COLOR,
        emissive: HEAD_COLOR,
        emissiveIntensity: 0.9,
        roughness: 0.4,
        transparent: true,
        opacity: 0,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => {
    const pole = poleRef.current;
    const head = headRef.current;
    if (!pole || !head) return;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();

    sensors.forEach((sensor, index) => {
      const [x, y, z] = sensor.position;
      matrix.compose(new THREE.Vector3(x, y - POLE_HEIGHT / 2, z), quaternion, new THREE.Vector3(1, 1, 1));
      pole.setMatrixAt(index, matrix);
      matrix.compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(1, 1, 1));
      head.setMatrixAt(index, matrix);
    });

    pole.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
  }, []);

  useFadeOpacity(active, [poleMaterial, headMaterial], MAX_OPACITY);

  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.24, 0.3, 24), []);
  const ringMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    [],
  );

  function handleHeadClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (!active || event.instanceId === undefined) return;
    const sensor = sensors[event.instanceId];
    if (!sensor) return;
    setOpenSensorId((current) => (current === sensor.id ? null : sensor.id));
  }

  const openSensor = sensors.find((sensor) => sensor.id === openSensorId) ?? null;

  return (
    <group>
      <instancedMesh ref={poleRef} args={[poleGeometry, poleMaterial, sensors.length]} frustumCulled={false} />
      <instancedMesh
        ref={headRef}
        args={[headGeometry, headMaterial, sensors.length]}
        frustumCulled={false}
        onClick={handleHeadClick}
        onPointerOver={(event) => {
          if (!active) return;
          event.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      />
      {active && openSensor ? (
        <>
          <mesh
            geometry={ringGeometry}
            material={ringMaterial}
            position={[openSensor.position[0], openSensor.position[1] - POLE_HEIGHT - 0.02, openSensor.position[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
          <Html position={openSensor.position} center distanceFactor={12} zIndexRange={[20, 0]}>
            <SensorReadout sensor={openSensor} onClose={() => setOpenSensorId(null)} />
          </Html>
        </>
      ) : null}
    </group>
  );
}

function SensorReadout({ sensor, onClose }: { sensor: (typeof sensors)[number]; onClose: () => void }) {
  return (
    <Panel variant="glass" padding="sm" className="flex w-52 -translate-y-24 flex-col gap-2 shadow-elevated">
      <div className="flex items-center justify-between gap-2">
        <Typography variant="caption">{sensor.label}</Typography>
        <IconButton aria-label="Close sensor readout" icon={<X />} intent="ghost" size="sm" onClick={onClose} />
      </div>
      <div className="flex flex-col gap-1">
        <ReadoutRow label="Temperature" value={`${sensor.temperatureC.toFixed(1)}°C`} />
        <ReadoutRow label="Humidity" value={`${sensor.humidityPercent}%`} />
        <ReadoutRow label="Soil Moisture" value={`${sensor.soilMoisturePercent}%`} />
        <ReadoutRow label="Battery" value={`${sensor.batteryPercent}%`} />
        <ReadoutRow label="Signal Strength" value={`${sensor.signalPercent}%`} />
      </div>
    </Panel>
  );
}

function ReadoutRow({ label, value }: { label: string; value: string }) {
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
