"use client";

import { Card, Divider, Typography } from "@agrinexus/ui";

import type { SensorRecord } from "@/lib/sensors/types";

function OverviewRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Typography variant="small" className="text-foreground-muted">
        {label}
      </Typography>
      <Typography variant="h4">{value}</Typography>
    </div>
  );
}

/**
 * LEFT PANEL — Sensor Overview. Every count is derived
 * straight from `useSensors()` (the Sensor Store) — no separate mock
 * summary, mirroring `FleetOverview` (Ground Robots).
 */
export function SensorOverview({ sensors }: { sensors: SensorRecord[] }) {
  const total = sensors.length;
  const online = sensors.filter((sensor) => sensor.status === "online").length;
  const offline = sensors.filter((sensor) => sensor.status === "offline").length;
  const warning = sensors.filter((sensor) => sensor.status === "warning").length;
  const critical = sensors.filter((sensor) => sensor.status === "critical").length;
  const batteryPowered = sensors.filter((sensor) => sensor.batteryPowered).length;
  const gatewayConnected = sensors.filter((sensor) => sensor.gatewayConnected).length;

  return (
    <Card className="flex h-full flex-col gap-4 p-4">
      <Typography variant="h4">Sensor Overview</Typography>
      <div className="flex flex-col gap-3">
        <OverviewRow label="Total Sensors" value={total} />
        <Divider />
        <OverviewRow label="Online" value={online} />
        <OverviewRow label="Offline" value={offline} />
        <OverviewRow label="Warning" value={warning} />
        <OverviewRow label="Critical" value={critical} />
        <Divider />
        <OverviewRow label="Battery Powered" value={batteryPowered} />
        <OverviewRow label="Gateway Connected" value={gatewayConnected} />
      </div>
    </Card>
  );
}
