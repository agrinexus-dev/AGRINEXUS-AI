"use client";

import { Card, CardContent, CardHeader, CardTitle, StatusBadge } from "@agrinexus/ui";

import type { DroneHealth, DroneRecord } from "@/lib/fleet/types";

const HEALTH_ORDER: DroneHealth[] = ["nominal", "attention", "critical"];

export function FleetHealthWidget({ drones }: { drones: DroneRecord[] }) {
  const counts: Record<DroneHealth, number> = { nominal: 0, attention: 0, critical: 0 };
  for (const drone of drones) counts[drone.health] += 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet Health</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {HEALTH_ORDER.map((health) => (
          <div key={health} className="flex items-center justify-between">
            <StatusBadge status={health} />
            <span className="font-mono text-sm text-foreground-muted">{counts[health]}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
