"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { buildStripGeometry } from "./ground-strip";
import { irrigationZones } from "./intelligence-data";
import { useFadeOpacity } from "./use-fade-opacity";

const ZONE_Y = 0.08;
const FLOW_Y = 0.26;
const FLOW_WIDTH = 0.6;
const MAX_ZONE_OPACITY = 0.42;
const MAX_FLOW_OPACITY = 0.8;
const DROPLETS_PER_PATH = 3;
const DROPLET_SPEED = 0.3;
const ACTIVE_COLOR = "#2f8fd6";
const INACTIVE_COLOR = "#5c6570";

const activeZones = irrigationZones.filter((zone) => zone.active);

export interface IrrigationOverlayProps {
  active: boolean;
}

/**
 * Irrigation overlay: per-plot zone tint (active = blue, inactive = grey),
 * a flow-path strip from each active zone's nearest water source, and a
 * handful of droplets lerping along each path — a lightweight stand-in for
 * "animated water flow", no particle/fluid simulation.
 */
export function IrrigationOverlay({ active }: IrrigationOverlayProps) {
  const zoneMeshRef = useRef<THREE.InstancedMesh>(null);
  const zoneGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const zoneMaterial = useMemo(
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
    const mesh = zoneMeshRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    // See `crop-health-overlay.tsx` — baked per-instance so it applies
    // before each instance's own translation, instead of rotating the
    // whole already-positioned arrangement via an object-level `rotation`.
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const color = new THREE.Color();

    irrigationZones.forEach((zone, index) => {
      matrix.compose(
        new THREE.Vector3(zone.center[0], ZONE_Y, zone.center[1]),
        quaternion,
        new THREE.Vector3(zone.size[0] * 0.94, zone.size[1] * 0.94, 1),
      );
      mesh.setMatrixAt(index, matrix);
      color.set(zone.active ? ACTIVE_COLOR : INACTIVE_COLOR);
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  const strips = useMemo(
    () =>
      activeZones.map((zone) => ({
        id: zone.plotId,
        geometry: buildStripGeometry(zone.sourcePoint, zone.center, FLOW_WIDTH, FLOW_Y),
      })),
    [],
  );
  const stripMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: ACTIVE_COLOR, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    [],
  );

  const dropletRef = useRef<THREE.InstancedMesh>(null);
  const dropletGeometry = useMemo(() => new THREE.SphereGeometry(0.16, 8, 8), []);
  const dropletMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#bfe6ff", transparent: true, opacity: 0, toneMapped: false }),
    [],
  );

  useFadeOpacity(active, [zoneMaterial], MAX_ZONE_OPACITY);
  useFadeOpacity(active, [stripMaterial, dropletMaterial], MAX_FLOW_OPACITY);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const start = useMemo(() => new THREE.Vector3(), []);
  const end = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const mesh = dropletRef.current;
    if (!mesh) return;

    let index = 0;
    activeZones.forEach((zone) => {
      start.set(zone.sourcePoint[0], FLOW_Y, zone.sourcePoint[1]);
      end.set(zone.center[0], FLOW_Y, zone.center[1]);

      for (let i = 0; i < DROPLETS_PER_PATH; i += 1) {
        const t = (clock.elapsedTime * DROPLET_SPEED + i / DROPLETS_PER_PATH) % 1;
        dummy.position.lerpVectors(start, end, t);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={zoneMeshRef} args={[zoneGeometry, zoneMaterial, irrigationZones.length]} frustumCulled={false} />
      {strips.map((strip) => (
        <mesh key={strip.id} geometry={strip.geometry} material={stripMaterial} />
      ))}
      {activeZones.length > 0 ? (
        <instancedMesh
          ref={dropletRef}
          args={[dropletGeometry, dropletMaterial, activeZones.length * DROPLETS_PER_PATH]}
          frustumCulled={false}
        />
      ) : null}
    </group>
  );
}
