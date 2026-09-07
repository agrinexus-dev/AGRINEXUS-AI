"use client";

import { useEffect } from "react";

import { useSensorStore } from "./sensor-store";
import { SENSOR_TYPE_META } from "./types";

const TICK_MS = 2000;
// Slow, steady drain — a sensor's coin-cell/small battery pack lasts many
// simulated days, not minutes (unlike a drone/robot's active battery drain).
const BATTERY_DRAIN_PERCENT_PER_TICK = 0.02;
const SIGNAL_JITTER_MAX = 1.5;
const LOW_BATTERY_ATTENTION_THRESHOLD = 20;
const LOW_BATTERY_CRITICAL_THRESHOLD = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Keeps every sensor's simulated reading/battery/signal drifting gradually
 * ("no random jumps") — a bounded random WALK each tick (small
 * +/- delta from the sensor's own previous value, clamped to its type's
 * plausible range), never a fresh random value. Mirrors the shape of
 * `use-robot-simulation.ts`, but sensors need no route/position logic at
 * all since they never move.
 *
 * Runs independently of whether the Digital Twin is mounted (like
 * `use-robot-simulation.ts`) — the Sensor Network page and Mission Control
 * widgets need live readings even with the 3D viewport closed.
 */
export function useSensorSimulation(): void {
  useEffect(() => {
    function tick() {
      const { order, sensors } = useSensorStore.getState();

      for (const id of order) {
        const sensor = sensors[id];
        if (!sensor) continue;
        if (sensor.status === "offline" || sensor.status === "maintenance") continue;

        const meta = SENSOR_TYPE_META[sensor.sensorType];
        const delta = (Math.random() * 2 - 1) * meta.driftStep;
        const nextReading = Math.round(clamp(sensor.currentReading + delta, meta.min, meta.max) * 10 ** meta.decimals) / 10 ** meta.decimals;
        useSensorStore.getState().updateReading(id, nextReading);

        const signalDelta = (Math.random() * 2 - 1) * SIGNAL_JITTER_MAX;
        useSensorStore.getState().updateSignal(id, Math.round(clamp(sensor.signalPercent + signalDelta, 20, 100)));

        if (sensor.batteryPowered) {
          const nextBattery = Math.round(clamp(sensor.batteryPercent - BATTERY_DRAIN_PERCENT_PER_TICK, 0, 100) * 10) / 10;
          useSensorStore.getState().updateBattery(id, nextBattery);

          // Deterministic, threshold-based health/status escalation as
          // battery genuinely runs low — never a random flip.
          if (nextBattery < LOW_BATTERY_CRITICAL_THRESHOLD && sensor.status !== "critical") {
            useSensorStore.getState().updateTelemetry(id, { status: "critical", health: "critical" });
          } else if (nextBattery < LOW_BATTERY_ATTENTION_THRESHOLD && sensor.health === "nominal") {
            useSensorStore.getState().updateTelemetry(id, { health: "attention" });
          }
        }
      }
    }

    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, []);
}
