"use client";

import type { LayerVisibility } from "../../types";
import { CropHealthOverlay } from "./crop-health-overlay";
import { DiseaseRiskOverlay } from "./disease-risk-overlay";
import { DroneCoverageOverlay } from "./drone-coverage-overlay";
import { EnergyOverlay } from "./energy-overlay";
import { HeatmapOverlay } from "./heatmap-overlay";
import {
  HUMIDITY_SEED,
  HUMIDITY_STOPS,
  SOIL_MOISTURE_SEED,
  SOIL_MOISTURE_STOPS,
  TEMPERATURE_SEED,
  TEMPERATURE_STOPS,
} from "./intelligence-data";
import { IrrigationOverlay } from "./irrigation-overlay";
import { SensorNetworkOverlay } from "./sensor-network-overlay";

export interface IntelligenceLayersProps {
  layers: LayerVisibility;
}

/**
 * Composes every visual intelligence overlay behind one mount
 * point in `Scene.tsx`. Purely compositional — each overlay owns its own
 * geometry/materials/fade and is independently toggleable; this component
 * doesn't touch Farm World, Autonomous Systems, or Selection State.
 */
export function IntelligenceLayers({ layers }: IntelligenceLayersProps) {
  return (
    <group>
      <HeatmapOverlay active={layers.soilMoisture} seed={SOIL_MOISTURE_SEED} stops={SOIL_MOISTURE_STOPS} yOffset={0.021} />
      <HeatmapOverlay active={layers.temperature} seed={TEMPERATURE_SEED} stops={TEMPERATURE_STOPS} yOffset={0.023} />
      <HeatmapOverlay active={layers.humidity} seed={HUMIDITY_SEED} stops={HUMIDITY_STOPS} yOffset={0.025} />
      <CropHealthOverlay active={layers.cropHealth} />
      <DiseaseRiskOverlay active={layers.diseaseRisk} />
      <DroneCoverageOverlay active={layers.droneCoverage} />
      <IrrigationOverlay active={layers.irrigation} />
      <EnergyOverlay active={layers.energy} />
      <SensorNetworkOverlay active={layers.sensorNetwork} />
    </group>
  );
}
