"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";

import { InsightCard } from "@agrinexus/ui";

import { useMissionStore } from "@/lib/missions/mission-store";
import { MISSION_FLIGHT_STATUSES } from "@/lib/missions/types";
import { useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";
import { ROBOT_MISSION_ACTIVE_STATUSES } from "@/lib/robot-missions/types";
import { useHistoricalStore } from "@/lib/sensor-analytics/historical-store";
import { getAllPlotRecommendations } from "@/lib/sensor-analytics/mission-integration";
import { computeSensorHealthScore, detectAnomalies } from "@/lib/sensor-analytics/trend-analysis";
import { useSensorStore } from "@/lib/sensors/sensor-store";

export interface FarmAnalyticsSummary {
  /** `null` only when there are no sensors reporting at all — never a fabricated score. */
  sensorHealthAverage: number | null;
  activeMissionCount: number;
  plotsNeedingIrrigation: number;
  plotsNeedingInspection: number;
}

/**
 * The real computation behind the dashboard "Analytics" widget — a plain
 * snapshot function (`.getState()` reads,
 * no hooks) so it can be called identically from the reactive widget below
 * AND from `collect-context.ts`'s one-shot-per-send context builder, exactly
 * the same "wired, non-pure, single source of truth" role
 * `mission-integration.ts`'s `getPlotRecommendation` already plays for the
 * reasoning engine. Reuses `computeSensorHealthScore`/`detectAnomalies`
 * (`trend-analysis.ts`) and `getAllPlotRecommendations`
 * (`mission-integration.ts`) — never a second computation of either.
 */
export function computeFarmAnalyticsSummary(): FarmAnalyticsSummary {
  const sensors = Object.values(useSensorStore.getState().sensors);
  const samplesBySensorId = useHistoricalStore.getState().samples;
  const healthScores = sensors.map((sensor) => computeSensorHealthScore(sensor, detectAnomalies(samplesBySensorId[sensor.id] ?? []).length));

  const recommendations = getAllPlotRecommendations();
  const missions = Object.values(useMissionStore.getState().missions);
  const robotMissions = Object.values(useRobotMissionStore.getState().missions);

  return {
    sensorHealthAverage: healthScores.length > 0 ? Math.round(healthScores.reduce((sum, value) => sum + value, 0) / healthScores.length) : null,
    activeMissionCount:
      missions.filter((mission) => MISSION_FLIGHT_STATUSES.includes(mission.status)).length +
      robotMissions.filter((mission) => ROBOT_MISSION_ACTIVE_STATUSES.includes(mission.status)).length,
    plotsNeedingIrrigation: recommendations.filter((recommendation) => recommendation.action === "irrigate").length,
    plotsNeedingInspection: recommendations.filter((recommendation) => recommendation.action === "inspect").length,
  };
}

/**
 * Previously a single hardcoded yield claim (`DASHBOARD_YIELD_INSIGHT` — a
 * fixed "Projected yield is 6% above seasonal average" string with no data
 * behind it, removed). There is still no real yield model anywhere in this
 * app; rather than inventing one, this now reports real, computable
 * farm-analytics numbers ("If a metric cannot be calculated,
 * show 'Data unavailable' rather than inventing a number"). The hooks below
 * exist only to trigger a rerender when the underlying stores change — the
 * actual numbers all come from `computeFarmAnalyticsSummary()` above, the
 * one place this computation lives.
 */
export function AnalyticsWidget() {
  useSensorStore((state) => state.sensors);
  useHistoricalStore((state) => state.samples);
  useMissionStore((state) => state.missions);
  useRobotMissionStore((state) => state.missions);

  // Every input this widget reads (live sensor telemetry, the Historical
  // Store's `persist`-backed samples, simulation state) is genuinely
  // client-only/mutable — even with `historical-store.ts`'s own
  // `skipHydration` fix in place, this is the ONE component that actually
  // renders that data as visible text during SSR, so it's also the one
  // place that needs to guarantee — architecturally, not by chasing down
  // every individual data source — that the server and the client's FIRST
  // render are identical. `mounted` starts `false` on both (deterministic),
  // so the body text below is byte-identical between SSR and first client
  // paint; the real, live numbers swap in via this `useEffect`, strictly
  // AFTER hydration has already committed — a normal post-mount update, not
  // a mismatch. This is the standard React/Next.js pattern for "genuinely
  // client-only derived value" (the exact one this app's own `AURA_MOUNT`
  // dynamic-import-with-ssr:false sidesteps for its own bundle; this widget
  // can't do the same — the surrounding grid still needs to SSR — so it
  // gates the DATA instead of the whole component).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const summary = computeFarmAnalyticsSummary();
  const attentionCount = summary.plotsNeedingIrrigation + summary.plotsNeedingInspection;

  const body = !mounted
    ? "Loading farm analytics…"
    : summary.sensorHealthAverage === null
      ? "Data unavailable — no sensors reporting yet."
      : [
          `Sensor network health: ${summary.sensorHealthAverage}/100.`,
          attentionCount > 0
            ? `${attentionCount} plot${attentionCount === 1 ? "" : "s"} need${attentionCount === 1 ? "s" : ""} attention (${summary.plotsNeedingIrrigation} irrigation, ${summary.plotsNeedingInspection} inspection).`
            : "No plots currently need irrigation or inspection.",
          `${summary.activeMissionCount} mission${summary.activeMissionCount === 1 ? "" : "s"} active.`,
        ].join(" ");

  return (
    <InsightCard
      title="Farm Analytics"
      body={body}
      tag={mounted && attentionCount > 0 ? "Attention" : "Live"}
      icon={<TrendingUp />}
      className="h-full"
    />
  );
}
