"use client";

import { Battery, Gauge, MoveVertical, Wifi } from "lucide-react";

import { TelemetryCard } from "@agrinexus/ui";

import type { DroneRecord } from "@/lib/fleet/types";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

/** Fleet-wide aggregate telemetry — averaged live from every drone currently in the Fleet Store, not a per-drone breakdown (the table already covers that). */
export function TelemetryCards({ drones }: { drones: DroneRecord[] }) {
  const avgAltitude = average(drones.map((drone) => drone.altitude));
  const avgSpeed = average(drones.map((drone) => drone.speedMps));
  const avgSignal = average(drones.map((drone) => drone.signalPercent));
  const totalFlightHours = drones.reduce((sum, drone) => sum + drone.flightHours, 0);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <TelemetryCard label="Avg Altitude" value={avgAltitude} unit="m" icon={<MoveVertical />} />
      <TelemetryCard label="Avg Speed" value={avgSpeed} unit="m/s" icon={<Gauge />} />
      <TelemetryCard label="Avg Signal" value={avgSignal} unit="%" icon={<Wifi />} />
      <TelemetryCard label="Total Flight Hours" value={totalFlightHours.toFixed(1)} icon={<Battery />} />
    </div>
  );
}
