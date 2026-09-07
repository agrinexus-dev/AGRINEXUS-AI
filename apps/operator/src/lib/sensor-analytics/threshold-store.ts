"use client";

import { create } from "zustand";

import type { ThresholdConfig, ThresholdMetric } from "./types";

const DEFAULT_THRESHOLDS: Record<ThresholdMetric, ThresholdConfig> = {
  "soil-moisture": { min: 20, max: 60, target: 40 },
  humidity: { min: 30, max: 80, target: 55 },
  temperature: { min: 10, max: 32, target: 22 },
  battery: { min: 20, max: 100, target: 100 },
  signal: { min: 40, max: 100, target: 90 },
};

/**
 * Threshold configuration ("Thresholds") — a small, dedicated
 * store (not folded into the Sensor Store, which is explicitly
 * DO-NOT-MODIFY this change) holding one editable min/max/target per
 * metric. Read by both the Analytics page's Thresholds panel and the Smart
 * Alerts ticker (`use-alert-simulation.ts`), so the displayed warning states
 * and the generated alerts always agree.
 */
interface ThresholdState {
  thresholds: Record<ThresholdMetric, ThresholdConfig>;
  updateThreshold: (metric: ThresholdMetric, update: Partial<ThresholdConfig>) => void;
  resetThreshold: (metric: ThresholdMetric) => void;
}

export const useThresholdStore = create<ThresholdState>((set) => ({
  thresholds: DEFAULT_THRESHOLDS,

  updateThreshold: (metric, update) => {
    set((state) => ({ thresholds: { ...state.thresholds, [metric]: { ...state.thresholds[metric], ...update } } }));
  },

  resetThreshold: (metric) => {
    set((state) => ({ thresholds: { ...state.thresholds, [metric]: DEFAULT_THRESHOLDS[metric] } }));
  },
}));

export { DEFAULT_THRESHOLDS };
