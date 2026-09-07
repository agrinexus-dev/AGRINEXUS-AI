"use client";

import { useMemo } from "react";
import * as THREE from "three";

import { WEATHER_PRESETS, type WeatherPreset } from "./weather";

const TERRAIN_SIZE = 64;
const TEXTURE_SIZE = 256;

export interface TerrainProps {
  weather: WeatherPreset;
}

/** Deterministic pseudo-random generator (mulberry32) — stable across renders, no `Math.random()`. */
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

/**
 * Generates a small mottled-green canvas texture once (patches of darker/
 * lighter grass tone) so the ground reads as a real field instead of one
 * flat fill color. Ground plane stays perfectly flat — buildings/roads/plots
 * all assume `y = 0` — only the *appearance* varies, not the geometry.
 */
/** Exported (011) so `Horizon`'s ground foundation can reuse the same mottled-grass look instead of duplicating this canvas-noise logic for a second, larger plane. */
export function buildTerrainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = "#33512b";
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const random = seededRandom(909);
  const patchColors = ["#3c5e31", "#2c4826", "#456a37", "#38562e"];
  for (let i = 0; i < 260; i += 1) {
    const x = random() * TEXTURE_SIZE;
    const y = random() * TEXTURE_SIZE;
    const radius = 4 + random() * 14;
    ctx.fillStyle = patchColors[Math.floor(random() * patchColors.length)] ?? "#3c5e31";
    ctx.globalAlpha = 0.35 + random() * 0.3;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function Terrain({ weather }: TerrainProps) {
  const config = WEATHER_PRESETS[weather];
  const geometry = useMemo(() => new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE), []);
  const texture = useMemo(() => buildTerrainTexture(), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ map: texture, color: config.groundTint, roughness: 0.92, metalness: 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texture],
  );
  material.color.set(config.groundTint);

  return <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />;
}
