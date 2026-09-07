"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

import { treePlacements, type TreePlacement } from "./farm-data";
import { useModelParts } from "./use-model-part";

/**
 * Only one production tree GLB was supplied (vs. the four Kenney varieties
 * this round-robin was built around) — all four variety slots load the same
 * model, so the tree line reads as one species instead of a mixed stand.
 * `tree.glb` is a trunk + foliage pair (two primitives under one node), so
 * each variety now renders two `instancedMesh`es (one per part) sharing the
 * same placement matrices, instead of the single-part version this replaces.
 */
const TREE_MODEL_URLS = ["/models/tree.glb", "/models/tree.glb", "/models/tree.glb", "/models/tree.glb"];

export function Trees() {
  const placementsByKind = useMemo(() => {
    const groups: TreePlacement[][] = TREE_MODEL_URLS.map(() => []);
    treePlacements.forEach((placement, index) => {
      groups[index % TREE_MODEL_URLS.length]?.push(placement);
    });
    return groups;
  }, []);

  return (
    <>
      {TREE_MODEL_URLS.map((url, kindIndex) => (
        <TreeVariety key={`${url}-${kindIndex}`} url={url} placements={placementsByKind[kindIndex] ?? []} />
      ))}
    </>
  );
}

function TreeVariety({ url, placements }: { url: string; placements: TreePlacement[] }) {
  const parts = useModelParts(url);
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);

  useEffect(() => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();

    meshRefs.current.forEach((mesh) => {
      if (!mesh) return;
      placements.forEach(({ position: [x, , z], scale }, index) => {
        matrix.compose(new THREE.Vector3(x, 0, z), quaternion, new THREE.Vector3(scale, scale, scale));
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [placements]);

  if (placements.length === 0) return null;

  return (
    <>
      {parts.map((part, partIndex) => (
        <instancedMesh
          key={partIndex}
          ref={(mesh) => {
            meshRefs.current[partIndex] = mesh;
          }}
          args={[part.geometry, part.material, placements.length]}
          castShadow
          receiveShadow
        />
      ))}
    </>
  );
}

TREE_MODEL_URLS.forEach((url) => useGLTF.preload(url));
