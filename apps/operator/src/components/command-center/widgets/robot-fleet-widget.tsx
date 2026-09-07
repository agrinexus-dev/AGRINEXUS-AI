"use client";

import { Bot } from "lucide-react";

import { Card, EmptyState, MissionCard } from "@agrinexus/ui";

import { useRobots } from "@/lib/robots/robot-store";
import type { RobotRecord } from "@/lib/robots/types";

/** Maps a robot's own health/status onto the design system's generic `Status` type — used by both this widget and (indirectly) anything reusing the same picture. */
function statusFor(robot: RobotRecord): "nominal" | "attention" | "critical" | "offline" {
  if (robot.status === "offline") return "offline";
  if (robot.health === "critical") return "critical";
  if (robot.health === "attention") return "attention";
  return "nominal";
}

/**
 * Robot widgets are data-driven — reads live from
 * `useRobots()` (the Robot Store), the same store the Ground Robots page and
 * the Digital Twin consume, replacing the old static `DASHBOARD_ROBOT_MISSION`
 * placeholder. Surfaces the most notable robot: one currently on a mission,
 * else the first robot in the fleet, else an honest empty state.
 */
export function RobotFleetWidget() {
  const robots = useRobots();
  const featured = robots.find((robot) => robot.status === "on-mission") ?? robots[0] ?? null;

  if (!featured) {
    return (
      <Card className="flex h-full items-center justify-center p-0">
        <EmptyState icon={<Bot />} title="No ground robots" description="Add a robot from the Ground Robots page." className="border-none" />
      </Card>
    );
  }

  return (
    <MissionCard
      title={featured.currentMissionLabel ?? featured.name}
      assetType="robot"
      status={statusFor(featured)}
      field={featured.currentMissionLabel ? featured.name : undefined}
      eta={featured.status === "returning" && featured.returningEtaAt ? `${Math.max(0, Math.ceil((featured.returningEtaAt - Date.now()) / 60000))} min` : undefined}
      // Mission progress isn't modeled for ground robots this change (see
      // `lib/robots/robot-store.ts`'s doc comment on the deliberately
      // lightweight Assign Mission design) — battery is shown as the one
      // real, live number this widget has, never a fabricated percent-complete.
      progress={featured.batteryPercent}
      icon={<Bot />}
      className="h-full"
    />
  );
}
