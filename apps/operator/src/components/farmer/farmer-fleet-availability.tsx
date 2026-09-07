"use client";

import { useEffect } from "react";

import { Card, CardContent, CardHeader, Typography } from "@agrinexus/ui";

import { FREE_DRONE_STATUSES, FREE_ROBOT_STATUSES } from "@/lib/autonomous/autonomous-behavior";
import { useFarmerTranslation } from "@/lib/farmer/i18n/use-farmer-translation";
import { useFleetHydration, useFleetStore } from "@/lib/fleet/fleet-store";
import { useRobotHydration, useRobotStore } from "@/lib/robots/robot-store";

/**
 * "Drone availability"/"Robot
 * availability" on the Farmer Dashboard. A Client Component (unlike the
 * rest of the dashboard, a Server Component): live vehicle status only
 * exists in the Fleet/Robot Stores (the DB Drone/Robot
 * DB rows are identity/config only, no live telemetry column to read
 * server-side), the same reason Operator's own dashboard widgets
 * (`command-center/widgets/drone-fleet-widget.tsx`) are client components
 * too. Reuses the EXACT "free" definition `autonomous-behavior.ts`'s own
 * dispatch sweep and the new `handle-selected-finding` action use
 * — never a second availability rule.
 *
 * two changes:
 *
 * 1. Merged into ONE compact "Fleet Available" card (previously two
 *  separate `KpiCard`s) — the approved composition's secondary-stat row
 *  is "approximately three compact groups" (Active Missions | Fleet
 *  Available | Current Weather), not five.
 *
 * 2. Fixes the MVP-UI.2-A audit's disclosed "—" finding. INVESTIGATION
 *  (traced Dashboard → this component → `useFleetStore`/`useRobotStore`
 *  → their existing `fetchDrones`/`fetchRobots`/`hydration` fields —
 *  see `fleet-store.ts`/`robot-store.ts`): the previous version rendered
 *  "—" whenever `Object.values(drones).length === 0`, which cannot tell
 *  "the store hasn't finished its first fetch yet" apart from "this farm
 *  genuinely has zero drones" — both produce an empty object. Root
 *  cause is (1) hydration timing: `fetchDrones()`/`fetchRobots()` are
 *  fired from a `useEffect`, which only runs strictly AFTER this
 *  Server-rendered page's first paint, so there is always a real (if
 *  brief) window where the store is still `"loading"`. This is
 *  confirmed, not guessed, by the SAME Dashboard page's own
 *  server-fetched `listDrones`/`listRobots` (used to resolve vehicle
 *  names for "Recent Completed Operations") returning real rows for
 *  this farm in the exact sessions where this component still showed
 *  "—". `useFleetHydration`/`useRobotHydration` already existed
 *  (mirroring `sensor-store.ts`'s own hydration pattern) but this
 *  component never read them — reading them is the entire fix; no
 *  architectural change was needed or made.
 */
function formatAvailability(count: number, total: number, hydration: "idle" | "loading" | "loaded" | "error"): string {
  // Loading (or not-yet-started): honestly "not known yet" — never
  // reinterpreted as 0, per this change's explicit rule.
  if (hydration === "idle" || hydration === "loading") return "…";
  // A real fetch failure: honestly "unavailable" — this is the one
  // legitimate remaining use of "—".
  if (hydration === "error") return "—";
  // Loaded: a real count, including a genuine "0 of 0" if the farm truly
  // has no drones/robots — never silently hidden as "—" either.
  return `${count} of ${total}`;
}

export function FarmerFleetAvailability() {
  const { t } = useFarmerTranslation();
  useEffect(() => {
    void useFleetStore.getState().fetchDrones();
    void useRobotStore.getState().fetchRobots();
  }, []);

  const drones = useFleetStore((state) => state.drones);
  const robots = useRobotStore((state) => state.robots);
  const droneHydration = useFleetHydration().status;
  const robotHydration = useRobotHydration().status;

  const droneList = Object.values(drones);
  const robotList = Object.values(robots);
  const availableDrones = droneList.filter((drone) => FREE_DRONE_STATUSES.includes(drone.status) && drone.activeMissionId === null).length;
  const availableRobots = robotList.filter((robot) => FREE_ROBOT_STATUSES.includes(robot.status) && robot.activeMissionId === null).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <Typography variant="caption">{t("dashboard.fleetAvailable")}</Typography>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Typography variant="small" className="text-foreground-muted">
            {t("dashboard.dronesAvailable")}
          </Typography>
          <bdi className="font-mono text-lg font-semibold text-foreground">{formatAvailability(availableDrones, droneList.length, droneHydration)}</bdi>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <Typography variant="small" className="text-foreground-muted">
            {t("dashboard.robotsAvailable")}
          </Typography>
          <bdi className="font-mono text-lg font-semibold text-foreground">{formatAvailability(availableRobots, robotList.length, robotHydration)}</bdi>
        </div>
      </CardContent>
    </Card>
  );
}
