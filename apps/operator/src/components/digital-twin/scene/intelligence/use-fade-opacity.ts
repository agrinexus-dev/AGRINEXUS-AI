"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const DEFAULT_FADE_SPEED = 6;

/**
 * Smooth on/off transition for an intelligence overlay ("no abrupt
 * switching"). Damps a shared opacity value toward 0/1 every
 * frame and writes it onto every material passed in — overlays render
 * unconditionally (materials/geometries built once via `useMemo`, never
 * recreated on toggle) and just fade, instead of mounting/unmounting.
 */
export function useFadeOpacity(
  active: boolean,
  materials: THREE.Material[],
  maxOpacity = 1,
  speed = DEFAULT_FADE_SPEED,
) {
  const opacity = useRef(0);

  useFrame((_, delta) => {
    const target = active ? maxOpacity : 0;
    opacity.current = THREE.MathUtils.damp(opacity.current, target, speed, delta);
    materials.forEach((material) => {
      material.opacity = opacity.current;
    });
  });

  return opacity;
}
