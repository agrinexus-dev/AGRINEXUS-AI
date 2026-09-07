"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { bushPlacements, farmSignPosition, windIndicatorPosition } from "../farm-data";
import { useModelPart, useModelPartAt } from "../use-model-part";

const BUSH_MODEL_URL = "/models/bush.glb";
// bush.glb bakes a 100x correction scale into its parent node (common in
// Blender-exported assets); useModelParts folds that into the geometry, so
// this is a plain "how big in this scene" factor on top of that — targets a
// ~1.2m shrub, in the same range as the old placeholder's placement scale.
const BUSH_BASE_SCALE = 0.58;
useGLTF.preload(BUSH_MODEL_URL);

const TRACTOR_MODEL_URL = "/models/tractor.glb";
// Measured directly from the GLB's own geometry (the tractor-scale
// fix): raw local bounding box is 9.35m (X) x 8.62m (Y) x
// 15.49m (Z), long axis Z — confirms the old "~9.4 x 8.6 x 15.5" comment's
// numbers were accurate. The problem was never the arithmetic (0.29 x
// 15.5 ≈ 4.5m is correct multiplication) — it's that a ~4.5m-long, ~2.5m-
// tall tractor is realistic for a LARGE utility tractor, but this one is
// parked right next to "Equipment Area" (farm-data.ts, the closest
// building at distance ~3.6 scene units — the warehouse/storage-shed are
// 5.4+ away), whose declared height is only 1.4m: nearly matching that
// building's own 5m x 4m footprint and towering ~1.8x its height read as
// oversized. Rescaled to a genuine COMPACT utility tractor instead (a real,
// smaller vehicle class — comparable to e.g. a Kubota B-series) targeting a
// 3.5m length: 3.5 / 15.492 ≈ 0.226, giving ~2.11m wide x ~1.95m tall x
// 3.50m long — still a substantial, clearly-a-real-tractor vehicle (taller
// than a person, longer than a car), just no longer close to the size of
// the small structure it's parked beside (now ~1.4x its height, not ~1.8x).
const TRACTOR_MODEL_SCALE = 0.226;
const TRACTOR_POSITION: [number, number] = [27, 3];
useGLTF.preload(TRACTOR_MODEL_URL);

/** Bushes, the wind vane, the farm sign, and a decorative parked tractor — static/gently-animated set dressing, none of it selectable. */
export function Decorations() {
  return (
    <group>
      <Bushes />
      <WindIndicator />
      <FarmSign />
      <ParkedTractor />
    </group>
  );
}

function Bushes() {
  const part = useModelPartAt(BUSH_MODEL_URL);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    bushPlacements.forEach(({ position: [x, , z], scale }, index) => {
      const finalScale = scale * BUSH_BASE_SCALE;
      matrix.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(finalScale, finalScale, finalScale));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return <instancedMesh ref={meshRef} args={[part.geometry, part.material, bushPlacements.length]} castShadow receiveShadow />;
}

/** Decorative parked tractor — a static prop, not selectable, no patrol/movement logic. */
function ParkedTractor() {
  const { geometry, material } = useModelPart(TRACTOR_MODEL_URL);
  const [x, z] = TRACTOR_POSITION;

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[x, 0, z]}
      scale={TRACTOR_MODEL_SCALE}
      castShadow
      receiveShadow
    />
  );
}

function WindIndicator() {
  const vaneRef = useRef<THREE.Group>(null);
  const [x, z] = windIndicatorPosition;

  const poleGeometry = useMemo(() => new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), []);
  const vaneGeometry = useMemo(() => new THREE.ConeGeometry(0.18, 0.7, 6), []);
  const poleMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4a4f57", roughness: 0.7 }), []);
  const vaneMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e8b339", roughness: 0.4 }), []);

  useFrame((_, delta) => {
    if (vaneRef.current) vaneRef.current.rotation.y += delta * 0.4;
  });

  return (
    <group position={[x, 0, z]}>
      <mesh geometry={poleGeometry} material={poleMaterial} position={[0, 1.2, 0]} castShadow />
      <group ref={vaneRef} position={[0, 2.5, 0]}>
        <mesh geometry={vaneGeometry} material={vaneMaterial} position={[0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
      </group>
    </group>
  );
}

function FarmSign() {
  const [x, z] = farmSignPosition;

  const postGeometry = useMemo(() => new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), []);
  const boardGeometry = useMemo(() => new THREE.BoxGeometry(2.2, 0.6, 0.08), []);
  const postMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4a3524", roughness: 0.9 }), []);
  const boardMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6b5a44", roughness: 0.7 }), []);

  return (
    <group position={[x, 0, z]}>
      <mesh geometry={postGeometry} material={postMaterial} position={[-0.9, 0.8, 0]} castShadow />
      <mesh geometry={postGeometry} material={postMaterial} position={[0.9, 0.8, 0]} castShadow />
      <mesh geometry={boardGeometry} material={boardMaterial} position={[0, 1.5, 0]} castShadow />
    </group>
  );
}
