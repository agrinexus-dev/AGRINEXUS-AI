"use client";

import { Html } from "@react-three/drei";

import { useHistoricalStore } from "@/lib/sensor-analytics/historical-store";
import { computeTrendStats } from "@/lib/sensor-analytics/trend-analysis";
import { useSensorStore } from "@/lib/sensors/sensor-store";
import { SENSOR_TYPE_META, type SensorRecord, type SensorType } from "@/lib/sensors/types";

import { farmPlots, type FarmPlotDefinition } from "../farm-data";
import type { LayerVisibility } from "../../types";

const HEATMAP_Y = 0.04;
const TREND_Y = 5.5;

interface HeatmapDefinition {
  layerKey: keyof LayerVisibility;
  sensorTypes: SensorType[];
  color: string;
}

// One hue per metric family — sequential form (dataviz skill: "one hue,
// more-is-darker" via opacity here rather than a multi-stop ramp, matching
// the exact technique `MissionOverlays`'/`RobotMissionOverlays`' own
// coverage fill already establishes in this codebase.
const HEATMAPS: HeatmapDefinition[] = [
  { layerKey: "analyticsSoilMoistureHeatmap", sensorTypes: ["soil-moisture"], color: "#3987e5" },
  { layerKey: "analyticsTemperatureHeatmap", sensorTypes: ["soil-temperature", "air-temperature"], color: "#d95926" },
  { layerKey: "analyticsHumidityHeatmap", sensorTypes: ["humidity"], color: "#199e70" },
  { layerKey: "analyticsPhHeatmap", sensorTypes: ["ph"], color: "#a684e8" },
  { layerKey: "analyticsEcHeatmap", sensorTypes: ["ec"], color: "#c98500" },
  { layerKey: "analyticsNpkHeatmap", sensorTypes: ["nitrogen", "phosphorus", "potassium"], color: "#4fae7a" },
];

function normalizedValue(sensors: SensorRecord[]): number | null {
  if (sensors.length === 0) return null;
  const fractions = sensors.map((sensor) => {
    const meta = SENSOR_TYPE_META[sensor.sensorType];
    return (sensor.currentReading - meta.min) / Math.max(1e-6, meta.max - meta.min);
  });
  return fractions.reduce((sum, value) => sum + value, 0) / fractions.length;
}

/**
 * Digital-Twin-compatible sensor analytics heatmaps — colors
 * each plot by the average (normalized) reading of its assigned sensors for
 * the active heatmap's metric family, reusing the exact farm plot coordinate
 * system every other overlay in this scene already uses. A plot with no
 * assigned sensor of that type simply renders nothing for that heatmap —
 * never a fabricated interpolated value. Coexists with every other layer
 * group (world, intelligence, mission, robot mission, sensor entity) via its
 * own independent `analytics*` layer keys.
 */
export function AnalyticsHeatmapOverlays({ layers }: { layers: LayerVisibility }) {
  const sensors = useSensorStore((state) => state.sensors);
  const sensorList = Object.values(sensors);

  return (
    <group>
      {HEATMAPS.map((heatmap) =>
        layers[heatmap.layerKey] ? (
          <group key={heatmap.layerKey}>
            {farmPlots.map((plot) => {
              const plotSensors = sensorList.filter((sensor) => sensor.assignedPlotId === plot.id && heatmap.sensorTypes.includes(sensor.sensorType));
              const value = normalizedValue(plotSensors);
              if (value === null) return null;
              return <HeatmapCell key={`${heatmap.layerKey}-${plot.id}`} plot={plot} color={heatmap.color} intensity={value} />;
            })}
          </group>
        ) : null,
      )}

      {layers.analyticsTrendVisualization ? <TrendVisualization sensors={sensorList} /> : null}
    </group>
  );
}

function HeatmapCell({ plot, color, intensity }: { plot: FarmPlotDefinition; color: string; intensity: number }) {
  return (
    <mesh position={[plot.center[0], HEATMAP_Y, plot.center[1]]} rotation={[-Math.PI / 2, 0, 0]} scale={[plot.size[0] - 1.5, plot.size[1] - 1.5, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color={color} transparent opacity={0.08 + Math.max(0, Math.min(1, intensity)) * 0.37} depthWrite={false} />
    </mesh>
  );
}

const TREND_GLYPH: Record<string, { symbol: string; color: string }> = {
  rising: { symbol: "▲", color: "#3ddc84" },
  falling: { symbol: "▼", color: "#ef4444" },
  stable: { symbol: "●", color: "#9aa5b1" },
};

function TrendVisualization({ sensors }: { sensors: SensorRecord[] }) {
  const samplesBySensorId = useHistoricalStore((state) => state.samples);

  return (
    <group>
      {sensors.map((sensor) => {
        const stats = computeTrendStats(samplesBySensorId[sensor.id] ?? []);
        const glyph = TREND_GLYPH[stats.direction] ?? TREND_GLYPH.stable!;
        return (
          <Html key={sensor.id} position={[sensor.position[0], TREND_Y, sensor.position[1]]} center distanceFactor={16} zIndexRange={[18, 0]}>
            <div
              className="flex size-6 items-center justify-center rounded-full bg-surface-elevated/90 text-xs font-bold shadow-elevated"
              style={{ color: glyph.color }}
              title={`${sensor.name}: ${stats.direction} (${stats.strength})`}
            >
              {glyph.symbol}
            </div>
          </Html>
        );
      })}
    </group>
  );
}
