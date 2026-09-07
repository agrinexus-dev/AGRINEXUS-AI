"use client";

import { useEffect } from "react";

import { useSensorStore } from "@/lib/sensors/sensor-store";

import { useAlertStore } from "./alert-store";
import { useThresholdStore } from "./threshold-store";

const TICK_MS = 3000;
const TEMPERATURE_SENSOR_TYPES = new Set(["soil-temperature", "air-temperature", "weather-station"]);

/**
 * Smart Alerts ticker — evaluates every live sensor against
 * the current threshold config each tick and opens/resolves alert records
 * accordingly. Pure read of the Sensor Store + Threshold Store, pure write
 * to the Alert Store — never touches sensor state itself. No notification
 * delivery (explicit prompt instruction) — this only ever produces records
 * `useAlerts()`/`useActiveAlerts()` can read.
 */
export function useAlertSimulation(): void {
  useEffect(() => {
    function tick() {
      const { order, sensors } = useSensorStore.getState();
      const { thresholds } = useThresholdStore.getState();
      const alertStore = useAlertStore.getState();

      for (const id of order) {
        const sensor = sensors[id];
        if (!sensor) continue;

        if (sensor.status === "offline") {
          alertStore.openAlert({
            sensorId: id,
            sensorName: sensor.name,
            alertType: "sensor-offline",
            severity: "critical",
            message: `${sensor.name} is offline.`,
            value: 0,
          });
        } else {
          alertStore.resolveAlert(id, "sensor-offline");
        }

        if (sensor.batteryPowered) {
          if (sensor.batteryPercent < thresholds.battery.min) {
            alertStore.openAlert({
              sensorId: id,
              sensorName: sensor.name,
              alertType: "low-battery",
              severity: sensor.batteryPercent < thresholds.battery.min / 2 ? "critical" : "warning",
              message: `${sensor.name} battery is at ${sensor.batteryPercent}% (below ${thresholds.battery.min}%).`,
              value: sensor.batteryPercent,
            });
          } else {
            alertStore.resolveAlert(id, "low-battery");
          }
        }

        if (sensor.signalPercent < thresholds.signal.min) {
          alertStore.openAlert({
            sensorId: id,
            sensorName: sensor.name,
            alertType: "poor-signal",
            severity: "warning",
            message: `${sensor.name} signal is at ${sensor.signalPercent}% (below ${thresholds.signal.min}%).`,
            value: sensor.signalPercent,
          });
        } else {
          alertStore.resolveAlert(id, "poor-signal");
        }

        if (sensor.sensorType === "soil-moisture") {
          if (sensor.currentReading < thresholds["soil-moisture"].min) {
            alertStore.openAlert({
              sensorId: id,
              sensorName: sensor.name,
              alertType: "low-soil-moisture",
              severity: sensor.currentReading < thresholds["soil-moisture"].min / 2 ? "critical" : "warning",
              message: `${sensor.name} reads ${sensor.currentReading}% (below ${thresholds["soil-moisture"].min}%).`,
              value: sensor.currentReading,
            });
          } else {
            alertStore.resolveAlert(id, "low-soil-moisture");
          }
        }

        if (TEMPERATURE_SENSOR_TYPES.has(sensor.sensorType)) {
          const { min, max } = thresholds.temperature;
          if (sensor.currentReading < min || sensor.currentReading > max) {
            alertStore.openAlert({
              sensorId: id,
              sensorName: sensor.name,
              alertType: "abnormal-temperature",
              severity: "warning",
              message: `${sensor.name} reads ${sensor.currentReading}°C (outside ${min}–${max}°C).`,
              value: sensor.currentReading,
            });
          } else {
            alertStore.resolveAlert(id, "abnormal-temperature");
          }
        }
      }
    }

    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, []);
}
