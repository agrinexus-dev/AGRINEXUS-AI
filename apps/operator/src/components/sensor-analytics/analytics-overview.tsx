"use client";

import { Card, Divider, Typography } from "@agrinexus/ui";

import type { SensorRecord } from "@/lib/sensors/types";

function OverviewRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Typography variant="small" className="text-foreground-muted">
        {label}
      </Typography>
      <Typography variant="h4">{value}</Typography>
    </div>
  );
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** LEFT PANEL — Analytics Overview. Mirrors `SensorOverview` exactly, computed straight from `useSensors()`. */
export function AnalyticsOverview({ sensors }: { sensors: SensorRecord[] }) {
  const active = sensors.filter((sensor) => sensor.status !== "offline").length;
  const healthy = sensors.filter((sensor) => sensor.health === "nominal").length;
  const warning = sensors.filter((sensor) => sensor.health === "attention").length;
  const critical = sensors.filter((sensor) => sensor.health === "critical").length;
  const avgBattery = average(sensors.map((sensor) => sensor.batteryPercent));
  const avgSignal = average(sensors.map((sensor) => sensor.signalPercent));
  const gatewayCount = new Set(sensors.map((sensor) => sensor.gateway)).size;

  return (
    <Card className="flex h-full flex-col gap-4 p-4">
      <Typography variant="h4">Analytics Overview</Typography>
      <div className="flex flex-col gap-3">
        <OverviewRow label="Total Active Sensors" value={active} />
        <Divider />
        <OverviewRow label="Healthy Sensors" value={healthy} />
        <OverviewRow label="Warning Sensors" value={warning} />
        <OverviewRow label="Critical Sensors" value={critical} />
        <Divider />
        <OverviewRow label="Average Battery" value={`${avgBattery}%`} />
        <OverviewRow label="Average Signal" value={`${avgSignal}%`} />
        <OverviewRow label="Total Gateways" value={gatewayCount} />
      </div>
    </Card>
  );
}
