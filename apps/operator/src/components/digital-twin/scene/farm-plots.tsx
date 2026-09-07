"use client";

import { Line } from "@react-three/drei";

import { farmPlots } from "./farm-data";

const BOUNDARY_HEIGHT = 0.03;

function plotOutline(center: [number, number], size: [number, number]): [number, number, number][] {
  const [cx, cz] = center;
  const [width, depth] = size;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;

  return [
    [cx - halfWidth, BOUNDARY_HEIGHT, cz - halfDepth],
    [cx + halfWidth, BOUNDARY_HEIGHT, cz - halfDepth],
    [cx + halfWidth, BOUNDARY_HEIGHT, cz + halfDepth],
    [cx - halfWidth, BOUNDARY_HEIGHT, cz + halfDepth],
    [cx - halfWidth, BOUNDARY_HEIGHT, cz - halfDepth],
  ];
}

/** Plot boundary outlines only — no crops, no per-plot content yet. */
export function FarmPlots() {
  return (
    <>
      {farmPlots.map((plot) => (
        <Line key={plot.id} points={plotOutline(plot.center, plot.size)} color="#5b8a6b" lineWidth={1.5} />
      ))}
    </>
  );
}
