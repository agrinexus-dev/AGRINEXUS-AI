/**
 * Simulated, deterministic data for the visual intelligence overlays
 * No backend, no telemetry, no AI — every value here is a
 * seeded pseudo-random placeholder, generated once at module load, derived
 * from the existing `farm-data.ts` geometry (plot positions, water sources,
 * infrastructure) so overlays line up with the real farm layout without
 * inventing a second coordinate system.
 */

import { canal, farmPlots, infrastructureItems, pond, type CropGrowthStage } from "../farm-data";
import type { GradientStop } from "./heatmap-texture";

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

// ---------------------------------------------------------------------------
// Crop Health — each plot subdivided into a 3x3 grid so the overlay reads as
// a real per-zone heatmap rather than one flat color per field.
// ---------------------------------------------------------------------------

export type HealthStatus = "healthy" | "moderate" | "attention" | "critical" | "harvest-ready";

export const HEALTH_STATUS_ORDER: HealthStatus[] = ["healthy", "moderate", "attention", "critical", "harvest-ready"];

export const HEALTH_COLORS: Record<HealthStatus, string> = {
  healthy: "#3fae4a",
  moderate: "#d8c93a",
  attention: "#e0862e",
  critical: "#d1423f",
  "harvest-ready": "#a15fd6",
};

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  healthy: "Healthy",
  moderate: "Moderate Stress",
  attention: "Needs Attention",
  critical: "Critical",
  "harvest-ready": "Harvest Ready",
};

/** A plot's growth stage gives its health overlay a plausible baseline (mature ≈ ready to harvest, fallow ≈ needs attention) before per-cell variation. */
const GROWTH_BASE_STATUS: Record<CropGrowthStage, HealthStatus> = {
  mature: "harvest-ready",
  growing: "healthy",
  seedling: "moderate",
  fallow: "attention",
};

function offsetStatus(base: HealthStatus, roll: number): HealthStatus {
  const index = HEALTH_STATUS_ORDER.indexOf(base);
  const offset = 1 + Math.floor(roll * (HEALTH_STATUS_ORDER.length - 1));
  return HEALTH_STATUS_ORDER[(index + offset) % HEALTH_STATUS_ORDER.length] ?? base;
}

export interface HealthCell {
  id: string;
  plotId: string;
  center: [number, number];
  size: [number, number];
  status: HealthStatus;
}

const HEALTH_GRID = 3;

function buildCropHealthCells(): HealthCell[] {
  const cells: HealthCell[] = [];

  farmPlots.forEach((plot, plotIndex) => {
    const random = seededRandom(4001 + plotIndex * 17);
    const baseStatus = GROWTH_BASE_STATUS[plot.growthStage];
    const [cx, cz] = plot.center;
    const [w, d] = plot.size;
    const cellW = w / HEALTH_GRID;
    const cellD = d / HEALTH_GRID;

    for (let ix = 0; ix < HEALTH_GRID; ix += 1) {
      for (let iz = 0; iz < HEALTH_GRID; iz += 1) {
        const roll = random();
        const status = roll < 0.72 ? baseStatus : offsetStatus(baseStatus, random());
        cells.push({
          id: `${plot.id}-health-${ix}-${iz}`,
          plotId: plot.id,
          center: [cx - w / 2 + cellW * (ix + 0.5), cz - d / 2 + cellD * (iz + 0.5)],
          size: [cellW * 0.92, cellD * 0.92],
          status,
        });
      }
    }
  });

  return cells;
}

export const cropHealthCells: HealthCell[] = buildCropHealthCells();

// ---------------------------------------------------------------------------
// Disease Risk — one risk level per plot, plus an optional hotspot point for
// plots above "low" risk so the overlay has something concrete to highlight.
// ---------------------------------------------------------------------------

export type RiskLevel = "low" | "moderate" | "high";

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: "#3fae4a",
  moderate: "#d8c93a",
  high: "#d1423f",
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Low Risk",
  moderate: "Moderate Risk",
  high: "High Risk",
};

export interface PlotRisk {
  plotId: string;
  center: [number, number];
  size: [number, number];
  level: RiskLevel;
  hotspot?: [number, number];
}

export const diseaseRiskByPlot: PlotRisk[] = farmPlots.map((plot, index) => {
  const random = seededRandom(5101 + index * 23);
  const roll = random();
  const level: RiskLevel = roll < 0.5 ? "low" : roll < 0.82 ? "moderate" : "high";
  const [cx, cz] = plot.center;
  const [w, d] = plot.size;
  const hotspot: [number, number] | undefined =
    level === "low" ? undefined : [cx + (random() - 0.5) * w * 0.5, cz + (random() - 0.5) * d * 0.5];

  return { plotId: plot.id, center: plot.center, size: plot.size, level, hotspot };
});

// ---------------------------------------------------------------------------
// Soil Moisture / Temperature / Humidity — shared ground-plane heatmaps (see
// `heatmap-texture.ts` / `heatmap-overlay.tsx`). Each just needs a seed (for
// its blob-noise field) and a 5-stop color gradient with a matching legend.
// ---------------------------------------------------------------------------

export const SOIL_MOISTURE_SEED = 9001;
export const TEMPERATURE_SEED = 9002;
export const HUMIDITY_SEED = 9003;

export interface LegendStop {
  label: string;
  color: string;
}

export const SOIL_MOISTURE_STOPS: GradientStop[] = [
  { value: 0, color: [70, 130, 220] },
  { value: 0.25, color: [80, 175, 100] },
  { value: 0.5, color: [214, 210, 80] },
  { value: 0.75, color: [224, 140, 60] },
  { value: 1, color: [206, 66, 60] },
];

export const SOIL_MOISTURE_LEGEND: LegendStop[] = [
  { label: "Saturated", color: "#4682dc" },
  { label: "Moist", color: "#50af64" },
  { label: "Average", color: "#d6d250" },
  { label: "Dry", color: "#e08c3c" },
  { label: "Very Dry", color: "#ce423c" },
];

export const TEMPERATURE_STOPS: GradientStop[] = [
  { value: 0, color: [70, 130, 220] },
  { value: 0.25, color: [90, 200, 210] },
  { value: 0.5, color: [224, 214, 90] },
  { value: 0.75, color: [230, 150, 60] },
  { value: 1, color: [206, 60, 55] },
];

export const TEMPERATURE_LEGEND: LegendStop[] = [
  { label: "Cool", color: "#4682dc" },
  { label: "Mild", color: "#5ac8d2" },
  { label: "Warm", color: "#e0d65a" },
  { label: "Hot", color: "#e6963c" },
  { label: "Very Hot", color: "#ce3c37" },
];

export const HUMIDITY_STOPS: GradientStop[] = [
  { value: 0, color: [230, 220, 170] },
  { value: 0.35, color: [170, 210, 190] },
  { value: 0.65, color: [90, 170, 200] },
  { value: 1, color: [60, 90, 190] },
];

export const HUMIDITY_LEGEND: LegendStop[] = [
  { label: "Dry Air", color: "#e6dcaa" },
  { label: "Moderate", color: "#aad2be" },
  { label: "Humid", color: "#5aaac8" },
  { label: "Saturated", color: "#3c5abe" },
];

// ---------------------------------------------------------------------------
// Irrigation — active/inactive per plot, each wired to whichever water
// source (pond or canal) is geometrically closer.
// ---------------------------------------------------------------------------

export interface IrrigationZone {
  plotId: string;
  center: [number, number];
  size: [number, number];
  active: boolean;
  sourcePoint: [number, number];
}

function nearestSourcePoint(cx: number, cz: number): [number, number] {
  const distPond = Math.hypot(cx - pond.center[0], cz - pond.center[1]);
  const distCanal = Math.abs(cz - canal.z);
  return distPond <= distCanal ? pond.center : [cx, canal.z];
}

export const irrigationZones: IrrigationZone[] = farmPlots.map((plot, index) => {
  const random = seededRandom(6201 + index * 11);
  return {
    plotId: plot.id,
    center: plot.center,
    size: plot.size,
    active: random() > 0.35,
    sourcePoint: nearestSourcePoint(plot.center[0], plot.center[1]),
  };
});

// ---------------------------------------------------------------------------
// Sensor Network — two sensors per plot (deterministic offsets), each with a
// full placeholder reading set.
// ---------------------------------------------------------------------------

export interface SensorReading {
  id: string;
  label: string;
  plotLabel: string;
  position: [number, number, number];
  temperatureC: number;
  humidityPercent: number;
  soilMoisturePercent: number;
  batteryPercent: number;
  signalPercent: number;
}

const SENSOR_HEIGHT = 1.3;

function buildSensors(): SensorReading[] {
  const random = seededRandom(7301);
  const readings: SensorReading[] = [];

  farmPlots.forEach((plot) => {
    const [cx, cz] = plot.center;
    const [w, d] = plot.size;
    const offsets: [number, number][] = [
      [-w * 0.28, -d * 0.28],
      [w * 0.28, d * 0.28],
    ];

    offsets.forEach(([ox, oz], offsetIndex) => {
      readings.push({
        id: `sensor-${plot.id}-${offsetIndex}`,
        label: `${plot.label} · Sensor ${offsetIndex + 1}`,
        plotLabel: plot.label,
        position: [cx + ox, SENSOR_HEIGHT, cz + oz],
        temperatureC: Math.round((18 + random() * 12) * 10) / 10,
        humidityPercent: Math.round(35 + random() * 45),
        soilMoisturePercent: Math.round(20 + random() * 60),
        batteryPercent: Math.round(45 + random() * 55),
        signalPercent: Math.round(50 + random() * 50),
      });
    });
  });

  return readings;
}

export const sensors: SensorReading[] = buildSensors();

// ---------------------------------------------------------------------------
// Energy — reuses the existing Solar Array / charging-pad positions from
// `farm-data.ts` rather than inventing new infrastructure geometry.
// ---------------------------------------------------------------------------

const solarArrayItem = infrastructureItems.find((item) => item.kind === "solar-array");
const dronePadItem = infrastructureItems.find((item) => item.kind === "drone-pad");
const robotStationItem = infrastructureItems.find((item) => item.kind === "robot-station");

const SOLAR_POSITION: [number, number] = solarArrayItem?.center ?? [27, -16];

export const energyNodes = {
  solar: SOLAR_POSITION,
  battery: [SOLAR_POSITION[0] + 3.2, SOLAR_POSITION[1] - 1.4] as [number, number],
  consumers: [dronePadItem?.center, robotStationItem?.center].filter((point): point is [number, number] => Boolean(point)),
};

export interface EnergyStats {
  generationKw: number;
  consumptionKw: number;
  batteryPercent: number;
}

export const baseEnergyStats: EnergyStats = { generationKw: 8.4, consumptionKw: 5.1, batteryPercent: 76 };

// ---------------------------------------------------------------------------
// Drone Coverage — a coarse grid over the farm interior. Completed/pending is
// a fixed simulated snapshot; "current scan" is a self-contained animation
// (see `drone-coverage-overlay.tsx`) that is NOT wired to the real Drone —
// this change is overlay-only, no live telemetry.
// ---------------------------------------------------------------------------

export type CoverageStatus = "completed" | "pending" | "scanning";

export const COVERAGE_COLORS: Record<CoverageStatus, string> = {
  completed: "#3fae4a",
  pending: "#6b7280",
  scanning: "#38bdf8",
};

export const COVERAGE_LABELS: Record<CoverageStatus, string> = {
  completed: "Completed",
  pending: "Pending",
  scanning: "Current Scan",
};

export interface CoverageCell {
  id: string;
  center: [number, number];
  size: [number, number];
  completed: boolean;
}

const COVERAGE_GRID = 6;
const COVERAGE_EXTENT = 28;

function buildCoverageCells(): CoverageCell[] {
  const random = seededRandom(8401);
  const cellSize = (COVERAGE_EXTENT * 2) / COVERAGE_GRID;
  const cells: CoverageCell[] = [];

  for (let ix = 0; ix < COVERAGE_GRID; ix += 1) {
    for (let iz = 0; iz < COVERAGE_GRID; iz += 1) {
      cells.push({
        id: `coverage-${ix}-${iz}`,
        center: [-COVERAGE_EXTENT + cellSize * (ix + 0.5), -COVERAGE_EXTENT + cellSize * (iz + 0.5)],
        size: [cellSize * 0.9, cellSize * 0.9],
        completed: random() > 0.38,
      });
    }
  }

  return cells;
}

export const droneCoverageCells: CoverageCell[] = buildCoverageCells();
