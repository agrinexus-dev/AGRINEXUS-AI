"use client";

import * as THREE from "three";

/**
 * Flat quad lying directly in the XZ ground plane at a fixed height,
 * connecting two ground points — no per-instance rotation math needed.
 * Shared by the Irrigation (water flow paths) and Energy (power flow)
 * overlays, which both draw a handful of animated "flow" connectors.
 */
export function buildStripGeometry(start: [number, number], end: [number, number], width: number, y: number): THREE.BufferGeometry {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz) || 1;
  const nx = (-dz / length) * (width / 2);
  const nz = (dx / length) * (width / 2);

  const positions = new Float32Array([
    start[0] - nx, y, start[1] - nz,
    start[0] + nx, y, start[1] + nz,
    end[0] + nx, y, end[1] + nz,
    end[0] - nx, y, end[1] - nz,
  ]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}
