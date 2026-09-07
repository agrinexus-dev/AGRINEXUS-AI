"use client";

import * as THREE from "three";

/** Deterministic pseudo-random generator (mulberry32) — same approach as `farm-data.ts`, stable across renders, no `Math.random()`. */
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

export interface GradientStop {
  value: number;
  color: [number, number, number];
}

/** A handful of soft radial "hot spots" summed together and normalized to [0, 1] — cheap, deterministic stand-in for real sensor interpolation. No external noise library. */
function buildNoiseField(seed: number, size: number, blobCount: number): Float32Array {
  const random = seededRandom(seed);
  const blobs = Array.from({ length: blobCount }, () => ({
    x: random(),
    y: random(),
    radius: 0.18 + random() * 0.24,
    strength: 0.6 + random() * 0.7,
  }));

  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);
      const v = y / (size - 1);
      let value = 0;
      blobs.forEach((blob) => {
        const d = Math.hypot(u - blob.x, v - blob.y) / blob.radius;
        value += Math.max(0, 1 - d * d) * blob.strength;
      });
      field[y * size + x] = value;
    }
  }

  let min = Infinity;
  let max = -Infinity;
  field.forEach((value) => {
    if (value < min) min = value;
    if (value > max) max = value;
  });
  const range = max - min || 1;
  for (let i = 0; i < field.length; i += 1) {
    field[i] = ((field[i] ?? 0) - min) / range;
  }

  return field;
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function sampleGradient(stops: GradientStop[], value: number): [number, number, number] {
  for (let i = 0; i < stops.length - 1; i += 1) {
    const current = stops[i];
    const next = stops[i + 1];
    if (!current || !next) continue;
    if (value >= current.value && value <= next.value) {
      const t = (value - current.value) / (next.value - current.value || 1);
      return lerpColor(current.color, next.color, t);
    }
  }
  return stops[stops.length - 1]?.color ?? [255, 255, 255];
}

/**
 * Renders a seeded blob-noise field through a multi-stop color gradient into
 * a small canvas texture — shared by the Soil Moisture, Temperature, and
 * Humidity overlays. Built once (callers wrap this in their own `useMemo`),
 * never regenerated per frame; linear filtering on the low-res canvas gives
 * a smooth blurred-heatmap look for free.
 */
export function buildHeatmapTexture(seed: number, stops: GradientStop[], resolution = 48, blobCount = 6): THREE.CanvasTexture {
  const field = buildNoiseField(seed, resolution, blobCount);
  const canvas = document.createElement("canvas");
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const imageData = ctx.createImageData(resolution, resolution);
    for (let i = 0; i < field.length; i += 1) {
      const [r, g, b] = sampleGradient(stops, field[i] ?? 0);
      imageData.data[i * 4] = r;
      imageData.data[i * 4 + 1] = g;
      imageData.data[i * 4 + 2] = b;
      imageData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
