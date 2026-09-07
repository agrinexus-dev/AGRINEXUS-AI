"use client";

import { Activity, AlertTriangle, Droplets, HeartPulse, Radio, Thermometer } from "lucide-react";

import { MetricTile } from "@agrinexus/ui";

import { useHistoricalStore } from "@/lib/sensor-analytics/historical-store";
import { computeSensorHealthScore, computeTrendStats, detectAnomalies } from "@/lib/sensor-analytics/trend-analysis";
import { useSensors } from "@/lib/sensors/sensor-store";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

/**
 * Sensor widgets are data-driven — reads live from
 * `useSensors()` (the Sensor Store), replacing the old static
 * `DASHBOARD_SENSOR_NETWORK` placeholder, mirroring `RobotFleetWidget`'s own
 * migration off `DASHBOARD_ROBOT_MISSION`. "Trending" and
 * "Health Score" tiles added additively — the original six
 * tiles/their computations are untouched.
 */
export function SensorNetworkWidget() {
  const sensors = useSensors();
  const samplesBySensorId = useHistoricalStore((state) => state.samples);
  const online = sensors.filter((sensor) => sensor.status === "online").length;
  const offline = sensors.filter((sensor) => sensor.status === "offline").length;
  const critical = sensors.filter((sensor) => sensor.status === "critical").length;
  const alerts = sensors.filter((sensor) => sensor.status === "warning" || sensor.status === "critical").length;
  const avgSoilMoisture = average(sensors.filter((sensor) => sensor.sensorType === "soil-moisture").map((sensor) => sensor.currentReading));
  const avgTemperature = average(
    sensors.filter((sensor) => sensor.sensorType === "soil-temperature" || sensor.sensorType === "air-temperature").map((sensor) => sensor.currentReading),
  );

  const trending = sensors.filter((sensor) => computeTrendStats(samplesBySensorId[sensor.id] ?? []).direction !== "stable").length;
  const avgHealthScore = average(
    sensors.map((sensor) => computeSensorHealthScore(sensor, detectAnomalies(samplesBySensorId[sensor.id] ?? []).length)),
  );

  return (
    <div className="grid h-full grid-cols-4 gap-2">
      <MetricTile label="Online" value={online} icon={<Radio />} trend="up" />
      <MetricTile label="Offline" value={offline} icon={<Radio />} trend={offline > 0 ? "down" : "flat"} />
      <MetricTile label="Critical" value={critical} icon={<AlertTriangle />} trend={critical > 0 ? "down" : "flat"} />
      <MetricTile label="Alerts" value={alerts} icon={<AlertTriangle />} trend={alerts > 0 ? "down" : "flat"} />
      <MetricTile label="Avg Soil Moisture" value={avgSoilMoisture ?? "—"} unit={avgSoilMoisture !== null ? "%" : undefined} icon={<Droplets />} trend="flat" />
      <MetricTile label="Avg Temp" value={avgTemperature ?? "—"} unit={avgTemperature !== null ? "°C" : undefined} icon={<Thermometer />} trend="flat" />
      <MetricTile label="Trending" value={trending} icon={<Activity />} trend={trending > 0 ? "up" : "flat"} />
      <MetricTile label="Health Score" value={avgHealthScore ?? "—"} unit={avgHealthScore !== null ? "/100" : undefined} icon={<HeartPulse />} trend="flat" />
    </div>
  );
}
