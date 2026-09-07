"use client";

import { useEffect } from "react";

import { useSensorStore } from "@/lib/sensors/sensor-store";

import { useHistoricalStore } from "./historical-store";

// Wall-clock recording cadence — deliberately coarser than the Sensor
// Store's own 2s live-drift tick: a monitoring dashboard
// sampling every 10s while the underlying telemetry updates faster
// internally is realistic, and keeps the in-memory history array from
// growing unboundedly fast. Every recorded value is read directly from the
// Sensor Store's live (already-simulated) state — this hook never computes
// a reading of its own.
const RECORD_INTERVAL_MS = 10_000;

/**
 * Records each sensor's live state into the Historical Store on an
 * interval, and lazily backfills any sensor that doesn't have history yet
 * Mount this from any page that should keep history growing
 * — mirrors the mounted-page-scoped lifecycle every other simulation hook
 * in this app uses (`use-sensor-simulation.ts`, `use-robot-simulation.ts`, etc).
 */
export function useHistoricalSensorSimulation(): void {
  useEffect(() => {
    function tick() {
      const { order, sensors } = useSensorStore.getState();
      const historical = useHistoricalStore.getState();

      for (const id of order) {
        const sensor = sensors[id];
        if (!sensor) continue;
        historical.ensureBackfilled(sensor);
        historical.recordSample(id, {
          timestamp: Date.now(),
          reading: sensor.currentReading,
          batteryPercent: sensor.batteryPercent,
          signalPercent: sensor.signalPercent,
          health: sensor.health,
        });
      }

      historical.pruneRemoved(order);
    }

    tick();
    const interval = setInterval(tick, RECORD_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
}
