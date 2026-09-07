"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

/**
 * Every GLB under `public/models/` is a Kenney low-poly kit asset: one mesh,
 * vertex-colored, no external material state. This pulls that mesh's
 * geometry/material out so callers can drop it straight into a single
 * `<mesh>` or reuse it across an `<instancedMesh>`, the same way the rest of
 * this scene already shares `useMemo`'d primitive geometries/materials.
 * `useGLTF` caches per URL, so multiple callers requesting the same model
 * share one loaded scene — this just reads out of it, it doesn't reload.
 */
export function useModelPart(url: string): ModelPart {
  const { scene } = useGLTF(url);

  return useMemo(() => {
    let found: THREE.Mesh | null = null;
    scene.traverse((child) => {
      if (!found && (child as THREE.Mesh).isMesh) found = child as THREE.Mesh;
    });
    if (!found) throw new Error(`No mesh found in model: ${url}`);
    const mesh = found as THREE.Mesh;
    return { geometry: mesh.geometry, material: mesh.material };
  }, [scene, url]);
}

export interface ModelInstancePart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/**
 * For GLBs with multiple meshes/primitives that must still be drawn via
 * `instancedMesh` (e.g. a tree's separate trunk + foliage primitives) — one
 * caller-supplied placement matrix set drives one `<instancedMesh>` per part.
 * Unlike `useModelPart`, each part's accumulated node transform (some export
 * pipelines bake a corrective translation/rotation/scale into a parent node
 * rather than the mesh itself) is baked into a cloned copy of its geometry
 * via `matrixWorld`, so the returned geometry is already in the model's own
 * local space and `MODEL_SCALE` at the call site stays a plain "how big in
 * this scene" factor instead of also having to reverse-engineer a hidden
 * export-time correction.
 *
 * Also re-grounds the *combined* set so its lowest point sits at y=0 — some
 * assets' own pivot isn't at their base (see the water-tower/solar-panel
 * cases from the model-asset integration). The offset is computed once
 * across every part and baked into each part's geometry together, so a
 * multi-part model's parts (e.g. trunk vs. foliage) keep their correct
 * position relative to each other rather than each sinking to the ground
 * independently.
 */
export function useModelParts(url: string): ModelInstancePart[] {
  const { scene } = useGLTF(url);

  return useMemo(() => {
    scene.updateWorldMatrix(true, true);
    const parts: ModelInstancePart[] = [];
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      // A glTF mesh with an array-valued `material` always has at least one
      // entry (one per primitive) — the array form only exists because a
      // multi-primitive glTF "mesh" was split into a THREE.Group of Meshes.
      const material = Array.isArray(mesh.material) ? (mesh.material[0] as THREE.Material) : mesh.material;
      parts.push({ geometry, material });
    });
    if (parts.length === 0) throw new Error(`No mesh found in model: ${url}`);

    let minY = Infinity;
    for (const part of parts) {
      part.geometry.computeBoundingBox();
      const boxMinY = part.geometry.boundingBox?.min.y;
      if (boxMinY !== undefined && boxMinY < minY) minY = boxMinY;
    }
    if (Number.isFinite(minY) && minY !== 0) {
      for (const part of parts) part.geometry.translate(0, -minY, 0);
    }

    return parts;
  }, [scene, url]);
}

/** Convenience for callers that only need one part from `useModelParts` (a single-mesh asset that still needs its node-transform baked/re-grounded, unlike `useModelPart`). */
export function useModelPartAt(url: string, index = 0): ModelInstancePart {
  const parts = useModelParts(url);
  const part = parts[index];
  if (!part) throw new Error(`Model "${url}" has no part at index ${index}`);
  return part;
}

export interface ModelSceneResult {
  scene: THREE.Group;
  /**
   * Raw (unscaled) distance from the model's own lowest point up to y=0, in
   * its own local units. Multiply by whatever `scale` you apply and add to
   * your Y position so the model's base sits on the ground instead of
   * floating or sinking — a plain position offset on the object itself
   * would NOT scale correctly, since an Object3D's own `position` isn't
   * affected by its own `scale` (they're independent transform components).
   * Zero when `ground: false` (airborne units that manage their own
   * vertical placement, e.g. the drone).
   */
  groundOffset: number;
}

/**
 * For GLBs with multiple meshes that should be placed as a single instance
 * (a rover's body + wheels, a barn's walls/doors/windows) rather than
 * GPU-instanced across many placements. Returns a clone of the whole loaded
 * scene graph — geometries/materials stay shared with `useGLTF`'s cache, only
 * the Object3D hierarchy (and its transforms) is duplicated — so multiple
 * callers of the same URL don't fight over one shared scene's transform.
 */
export function useModelScene(url: string, options?: { ground?: boolean }): ModelSceneResult {
  const ground = options?.ground ?? true;
  const { scene } = useGLTF(url);

  return useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    let groundOffset = 0;
    if (ground) {
      const box = new THREE.Box3().setFromObject(clone);
      if (Number.isFinite(box.min.y)) groundOffset = -box.min.y;
    }

    return { scene: clone, groundOffset };
  }, [scene, ground]);
}
