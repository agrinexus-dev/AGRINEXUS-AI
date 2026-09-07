"use client";

import { useMemo } from "react";
import * as THREE from "three";

import { buildHeatmapTexture, type GradientStop } from "./heatmap-texture";
import { useFadeOpacity } from "./use-fade-opacity";

const FARM_EXTENT = 64;

export interface HeatmapOverlayProps {
  active: boolean;
  seed: number;
  stops: GradientStop[];
  yOffset: number;
  maxOpacity?: number;
}

/**
 * Shared ground-plane heatmap: a single quad textured with a seeded
 * blob-gradient (see `heatmap-texture.ts`). Backs the Soil Moisture,
 * Temperature, and Humidity layers — only the seed/color stops/height
 * differ, so this is the one place that geometry/material get built.
 */
export function HeatmapOverlay({ active, seed, stops, yOffset, maxOpacity = 0.55 }: HeatmapOverlayProps) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(FARM_EXTENT, FARM_EXTENT), []);
  const texture = useMemo(() => buildHeatmapTexture(seed, stops), [seed, stops]);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    [texture],
  );

  useFadeOpacity(active, [material], maxOpacity);

  return <mesh geometry={geometry} material={material} position={[0, yOffset, 0]} rotation={[-Math.PI / 2, 0, 0]} />;
}
