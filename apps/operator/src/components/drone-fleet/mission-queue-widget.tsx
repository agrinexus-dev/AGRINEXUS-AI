"use client";

import { PlaneTakeoff } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, EmptyState, MissionCard } from "@agrinexus/ui";

import type { DroneRecord } from "@/lib/fleet/types";

/**
 * "In mission" means currently airborne — flying an active mission or
 * returning to home. "on-mission" is the real status a
 * flying drone gets (`use-mission-simulation.ts`); "patrolling" is kept
 * defensively (no longer assigned by default, but not removed from
 * `DroneStatus`). No fabricated ETA/progress: this fleet has no real
 * mission-planning backend yet, so only real telemetry fields are shown.
 */
export function MissionQueueWidget({ drones }: { drones: DroneRecord[] }) {
  const active = drones.filter((drone) => drone.status === "on-mission" || drone.status === "returning" || drone.status === "patrolling");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mission Queue</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {active.length === 0 ? (
          <EmptyState
            icon={<PlaneTakeoff />}
            title="No active missions"
            description="Drones will appear here once they're flying a mission or returning to home."
            className="py-8"
          />
        ) : (
          active.map((drone) => (
            <MissionCard
              key={drone.id}
              title={drone.name}
              assetType="drone"
              status={drone.health}
              field={`Near ${drone.currentWaypointLabel}`}
              icon={<PlaneTakeoff />}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
