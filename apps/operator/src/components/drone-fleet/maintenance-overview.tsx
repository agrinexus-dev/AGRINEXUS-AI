"use client";

import { Wrench } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, EmptyState, StatusBadge, Typography } from "@agrinexus/ui";

import type { DroneRecord } from "@/lib/fleet/types";

/** Lists drones whose real telemetry indicates they need attention (health != nominal, or status is maintenance) — every line restates actual Fleet Store fields, never a fabricated diagnosis. */
export function MaintenanceOverview({ drones }: { drones: DroneRecord[] }) {
  const flagged = drones.filter((drone) => drone.health !== "nominal" || drone.status === "maintenance");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance Overview</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {flagged.length === 0 ? (
          <EmptyState icon={<Wrench />} title="No drones need attention" description="Every drone in the fleet is nominal." className="py-8" />
        ) : (
          flagged.map((drone) => (
            <div key={drone.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3">
              <div className="flex flex-col gap-0.5">
                <Typography variant="body" className="font-medium">
                  {drone.name}
                </Typography>
                <Typography variant="caption">
                  Battery {drone.batteryPercent}% · Storage {drone.storageUsedPercent}% · {drone.flightHours.toFixed(1)} flight hrs
                </Typography>
              </div>
              <StatusBadge status={drone.health} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
