"use client";

import { PlaneTakeoff } from "lucide-react";

import { Card, EmptyState, MissionCard } from "@agrinexus/ui";

import { useFleetDrones } from "@/lib/fleet/fleet-store";
import type { DroneRecord } from "@/lib/fleet/types";
import { useMissions } from "@/lib/missions/mission-store";
import { MISSION_FLIGHT_STATUSES } from "@/lib/missions/types";

/** Maps a drone's own health/status onto the design system's generic `Status` type — mirrors `RobotFleetWidget`'s own `statusFor`. */
function statusFor(drone: DroneRecord): "nominal" | "attention" | "critical" | "offline" {
  if (drone.status === "offline") return "offline";
  if (drone.health === "critical") return "critical";
  if (drone.health === "attention") return "attention";
  return "nominal";
}

/**
 * Drone widget is data-driven — replaces the old static
 * `DASHBOARD_DRONE_MISSION` placeholder ("Drone Alpha — North Field Survey",
 * a fixed 68%/6-min mission card that never agreed with the real Drone
 * Fleet/Mission Planner pages), the exact "duplicated mission summary"
 * pattern Part 8 calls out, mirroring `RobotFleetWidget`'s own migration
 * and reading from the SAME Fleet/Mission Stores the Drone
 * Fleet page and Digital Twin already use — no new computation. Surfaces
 * the most notable drone: one currently on a mission, else the first drone
 * in the fleet, else an honest empty state. ETA/progress come from the
 * drone's real active mission when it has one (real `MissionEstimate`/
 * `progressPercent`, not a fabricated number); otherwise progress falls
 * back to the drone's own battery, same "one real, live number" fallback
 * `RobotFleetWidget` already documents for the ground-robot case (mission
 * progress isn't modeled there at all).
 */
export function DroneFleetWidget() {
  const drones = useFleetDrones();
  const missions = useMissions();
  const featured = drones.find((drone) => drone.status === "on-mission") ?? drones[0] ?? null;

  if (!featured) {
    return (
      <Card className="flex h-full items-center justify-center p-0">
        <EmptyState icon={<PlaneTakeoff />} title="No drones" description="Add a drone from the Drone Fleet page." className="border-none" />
      </Card>
    );
  }

  const activeMission = missions.find((mission) => mission.assignedDroneId === featured.id && MISSION_FLIGHT_STATUSES.includes(mission.status)) ?? null;
  const remainingMinutes =
    activeMission?.estimate?.durationMinutes !== undefined && activeMission?.estimate?.durationMinutes !== null
      ? Math.max(0, Math.round(activeMission.estimate.durationMinutes * (1 - activeMission.progressPercent / 100)))
      : null;

  return (
    <MissionCard
      title={activeMission?.name ?? featured.name}
      assetType="drone"
      status={statusFor(featured)}
      field={activeMission ? featured.name : undefined}
      eta={remainingMinutes !== null ? `${remainingMinutes} min` : undefined}
      progress={activeMission ? Math.round(activeMission.progressPercent) : featured.batteryPercent}
      icon={<PlaneTakeoff />}
      className="h-full"
    />
  );
}
