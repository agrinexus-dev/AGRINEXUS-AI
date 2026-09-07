"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Droplets, Gauge, ListChecks, Repeat, Thermometer, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";

import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, MetricTile, SectionHeader, StatusBadge, Typography, type Status } from "@agrinexus/ui";

import { computeFarmAnalyticsSummary } from "@/components/command-center/widgets/analytics-widget";
import type { FarmAnalyticsSnapshot } from "@/lib/analytics/analytics-service";
import type { FarmHistoricalAnalytics } from "@/lib/analytics/historical-analytics-service";
import { useFleetStore } from "@/lib/fleet/fleet-store";
import { useFindingStore } from "@/lib/findings/finding-store";
import { useMissionStore } from "@/lib/missions/mission-store";
import { usePlotStore, usePlots } from "@/lib/plots/plot-store";
import { useRecurringMissionStore, useRecurringMissions } from "@/lib/recurring-missions/recurring-mission-store";
import { useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";
import { useRobotStore } from "@/lib/robots/robot-store";
import { useAlertStore } from "@/lib/sensor-analytics/alert-store";
import { useHistoricalStore } from "@/lib/sensor-analytics/historical-store";
import { getAllPlotRecommendations } from "@/lib/sensor-analytics/mission-integration";
import type { PlotRecommendation } from "@/lib/sensor-analytics/reasoning-engine";
import { computeSensorHealthScore, computeTrendStats, detectAnomalies } from "@/lib/sensor-analytics/trend-analysis";
import { useSensors, useSensorStore } from "@/lib/sensors/sensor-store";
import { SENSOR_TYPE_META, type SensorRecord } from "@/lib/sensors/types";

import { CropFindingsCard } from "./crop-findings-card";
import { FindingsHistoryCard } from "./findings-history-card";
import { MissionActivityHistoryCard } from "./mission-activity-history-card";
import { PlotAnalyticsCard } from "./plot-analytics-card";
import { RobotResolutionCard } from "./robot-resolution-card";

const RECOMMENDATION_BADGE: Record<PlotRecommendation["action"], Status> = {
  irrigate: "critical",
  inspect: "attention",
  monitor: "nominal",
  unavailable: "offline",
};

const RECOMMENDATION_LABEL: Record<PlotRecommendation["action"], string> = {
  irrigate: "Irrigate",
  inspect: "Inspect",
  monitor: "Normal",
  unavailable: "Unavailable",
};

/**
 * Analytics (backend-connected) — the sidebar's
 * farm-wide "Analytics" destination, distinct from the Sensor Analytics
 * Center (`/sensor-network/analytics`), which stays the
 * deep-dive per-sensor chart tool this page links out to rather than
 * duplicates.
 *
 * Two kinds of numbers on this page, deliberately not blended into one
 * computation:
 *  - Pure counts (active/total mission counts, plot count) come from
 *  `initialSnapshot` — a real Postgres aggregate query
 *  (`analytics-service.ts`'s `getFarmAnalyticsSnapshot`), server-rendered
 *  by `app/(shell)/analytics/page.tsx` so they're correct even on a hard
 *  refresh landing directly here, with no dependency on some OTHER page
 *  having already hydrated the Mission/Plot Zustand stores first.
 *  - Everything that depends on LIVE current sensor readings and the
 *  Agricultural Reasoning Engine (sensor health score, anomaly count,
 *  trend direction, plot irrigation/inspection recommendations) still
 *  comes from the SAME client functions every other surface already uses
 *  — `computeFarmAnalyticsSummary` (Command Center widget + AURA
 *  context), `getAllPlotRecommendations`,
 *  `computeSensorHealthScore`/`detectAnomalies`/`computeTrendStats` — no
 *  backend model exists for the Threshold Store this reasoning depends
 *  on, so reproducing it server-side would mean a second, competing
 *  implementation; see `reports-service.ts`'s doc comment for the full
 *  reasoning. This page's own mount effects below just make sure those
 *  stores are actually hydrated from the backend before computing from
 *  them, which they previously were not guaranteed to be on a direct
 *  navigation to `/analytics`.
 *
 * This change adds a THIRD kind of number: real HISTORICAL analytics
 * (`initialHistory`/`history`, from `historical-analytics-service.ts` via
 * the same `/api/analytics` response's new `history` field) — findings over
 * time, mission activity, and robot effectiveness, computed server-side
 * from real persisted timestamps. Fetched and cached independently of
 * `snapshot` so a failure in one never blocks the other.
 */
export function AnalyticsPage({
  initialSnapshot,
  initialHistory,
}: {
  initialSnapshot: FarmAnalyticsSnapshot | null;
  initialHistory?: FarmHistoricalAnalytics | null;
}) {
  const [snapshot, setSnapshot] = useState<FarmAnalyticsSnapshot | null>(initialSnapshot);
  const [history, setHistory] = useState<FarmHistoricalAnalytics | null>(initialHistory ?? null);

  useEffect(() => {
    if (snapshot && history) return;
    let cancelled = false;
    fetch("/api/analytics")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { snapshot?: FarmAnalyticsSnapshot; history?: FarmHistoricalAnalytics } | null) => {
        if (cancelled) return;
        if (body?.snapshot) setSnapshot(body.snapshot);
        if (body?.history) setHistory(body.history);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrates the stores the reasoning-engine-derived sections below read
  // from, so this page shows real data even when it's the first page
  // opened this session — same one-time,
  // merge-by-id pattern `digital-twin-page.tsx` already established.
  useEffect(() => {
    void useSensorStore.getState().fetchSensors();
    void useAlertStore.getState().fetchAlerts();
    void usePlotStore.getState().fetchPlots();
    void useFleetStore.getState().fetchDrones();
    void useRobotStore.getState().fetchRobots();
    void useMissionStore.getState().fetchMissions();
    void useRobotMissionStore.getState().fetchRobotMissions();
    void useFindingStore.getState().fetchFindings();
    void useRecurringMissionStore.getState().fetchRecurringMissions();
  }, []);

  const sensors = useSensors();
  const samplesBySensorId = useHistoricalStore((state) => state.samples);
  const plots = usePlots();

  const summary = computeFarmAnalyticsSummary();
  const recommendations = getAllPlotRecommendations();

  const activeDroneMissions = snapshot?.droneMissions.active ?? 0;
  const activeRobotMissions = snapshot?.robotMissions.active ?? 0;
  const activeMissionCount = snapshot ? activeDroneMissions + activeRobotMissions : summary.activeMissionCount;

  // Real counts only, from the same Recurring Mission
  // Store the Mission Planner's own panel and scheduler read from; no
  // fabricated time-series (there's no historical run-count series to
  // chart from yet — see the final report's remaining-work section).
  const recurringMissions = useRecurringMissions();
  const recurringEnabledCount = recurringMissions.filter((config) => config.enabled).length;
  const recurringActiveCount = recurringMissions.filter((config) => config.activeRunId !== null).length;
  const plotCount = snapshot?.plots.total ?? plots.length;

  const sensorsWithScores = sensors.map((sensor) => ({
    sensor,
    score: computeSensorHealthScore(sensor, detectAnomalies(samplesBySensorId[sensor.id] ?? []).length),
    anomalyCount: detectAnomalies(samplesBySensorId[sensor.id] ?? []).length,
  }));
  const weakestSensors = sensorsWithScores
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);
  const totalAnomalies = sensorsWithScores.reduce((sum, entry) => sum + entry.anomalyCount, 0);

  // Previously hardcoded to exactly 3 sensor types
  // (soil-moisture/soil-temperature/air-temperature), which silently
  // excluded Plot C's humidity sensor and Plot D's pH sensor from this card
  // even when real trend history existed for them — one of the "several
  // analytics cards only show temperature and humidity or limited metrics"
  // problems this change fixes. Now covers EVERY sensor the farm actually
  // has; the only filter is "does it have enough recorded history to trend
  // at all" (never fewer than 2 samples), so no plot's real sensor is
  // structurally excluded from its own farm-wide trends.
  const trendRows = sensors
    .map((sensor) => {
      const samples = samplesBySensorId[sensor.id] ?? [];
      if (samples.length < 2) return null;
      return { sensor, trend: computeTrendStats(samples) };
    })
    .filter((row): row is { sensor: SensorRecord; trend: ReturnType<typeof computeTrendStats> } => row !== null);

  return (
    <div className="flex flex-col gap-5 pb-20">
      <SectionHeader
        title="Analytics"
        description="Farm-wide performance, computed from the same live sensor, mission, and reasoning data every other page uses."
        actions={
          <Link href="/sensor-network/analytics" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
            Open Sensor Analytics Center
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Farm Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile
            label="Sensor Network Health"
            value={summary.sensorHealthAverage === null ? "Unavailable" : summary.sensorHealthAverage}
            unit={summary.sensorHealthAverage === null ? undefined : "/100"}
            icon={<Gauge />}
          />
          <MetricTile label="Active Missions" value={activeMissionCount} icon={<ListChecks />} />
          <MetricTile label="Plots Needing Irrigation" value={summary.plotsNeedingIrrigation} icon={<Droplets />} />
          <MetricTile label="Plots Needing Inspection" value={summary.plotsNeedingInspection} icon={<TriangleAlert />} />
        </CardContent>
      </Card>

      <PlotAnalyticsCard plotHealth={history?.plotHealth ?? null} />

      <CropFindingsCard />

      <FindingsHistoryCard history={history?.findings ?? null} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MissionActivityHistoryCard history={history?.missions ?? null} />
        <RobotResolutionCard effectiveness={history?.robotEffectiveness ?? null} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fields Requiring Attention</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {recommendations.map((rec) => (
              <div key={rec.plotId} className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3">
                <div className="flex flex-col gap-0.5">
                  <Typography variant="small" className="font-medium text-foreground">
                    {rec.plotLabel}
                  </Typography>
                  <Typography variant="caption" className="text-foreground-subtle">
                    {rec.reason}
                  </Typography>
                </div>
                <StatusBadge status={RECOMMENDATION_BADGE[rec.action]} label={RECOMMENDATION_LABEL[rec.action]} />
              </div>
            ))}
            <Typography variant="caption" className="text-foreground-subtle">
              Ranked by the same Agricultural Reasoning Engine AURA and the Digital Twin use — ask AURA &ldquo;Which fields are getting
              dry?&rdquo; for the same list conversationally.
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sensor Anomalies</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {totalAnomalies === 0 ? (
              <EmptyState icon={<Gauge />} title="No anomalies detected" description="Every sensor's recent readings fall within its normal moving-average band." />
            ) : (
              <>
                {weakestSensors
                  .filter((entry) => entry.anomalyCount > 0)
                  .map(({ sensor, score, anomalyCount }) => (
                    <div key={sensor.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3">
                      <div className="flex flex-col gap-0.5">
                        <Typography variant="small" className="text-foreground">
                          {sensor.name}
                        </Typography>
                        <Typography variant="caption" className="text-foreground-subtle">
                          Health score {score}/100
                        </Typography>
                      </div>
                      <Badge intent={anomalyCount >= 3 ? "critical" : "warning"}>
                        {anomalyCount} anomal{anomalyCount === 1 ? "y" : "ies"}
                      </Badge>
                    </div>
                  ))}
                <Typography variant="caption" className="text-foreground-subtle">
                  {totalAnomalies} anomal{totalAnomalies === 1 ? "y" : "ies"} detected across {sensors.length} sensors (readings more than ~2
                  standard deviations from their recent moving average).
                </Typography>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sensor Trends</CardTitle>
        </CardHeader>
        <CardContent>
          {trendRows.length === 0 ? (
            <EmptyState
              icon={<TrendingUp />}
              title="Not enough history yet"
              description="Trend direction needs at least two recorded samples per sensor — open the Digital Twin, Sensor Network, or Sensor Analytics Center for a while to build history, or check back shortly."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {trendRows.map(({ sensor, trend }) => (
                <div key={sensor.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3">
                  <div className="flex items-center gap-2">
                    {sensor.sensorType === "soil-moisture" ? (
                      <Droplets className="size-4 text-foreground-muted" aria-hidden />
                    ) : sensor.sensorType === "soil-temperature" || sensor.sensorType === "air-temperature" ? (
                      <Thermometer className="size-4 text-foreground-muted" aria-hidden />
                    ) : (
                      <Gauge className="size-4 text-foreground-muted" aria-hidden />
                    )}
                    <Typography variant="small" className="text-foreground">
                      {sensor.name}
                    </Typography>
                  </div>
                  <div className="flex items-center gap-3">
                    <Typography variant="caption" className="text-foreground-subtle">
                      avg {trend.average.toFixed(SENSOR_TYPE_META[sensor.sensorType].decimals)} {SENSOR_TYPE_META[sensor.sensorType].unit}
                    </Typography>
                    <Badge intent={trend.direction === "rising" ? "success" : trend.direction === "falling" ? "critical" : "neutral"}>
                      {trend.direction === "rising" ? <TrendingUp className="size-3" /> : trend.direction === "falling" ? <TrendingDown className="size-3" /> : null}
                      {trend.direction} · {trend.strength}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Active Missions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <MetricTile label="Drone Missions" value={activeDroneMissions} icon={<ListChecks />} />
            <MetricTile label="Robot Missions" value={activeRobotMissions} icon={<ListChecks />} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recurring Missions</CardTitle>
          </CardHeader>
          <CardContent>
            {recurringMissions.length === 0 ? (
              <Typography variant="small" className="text-foreground-muted">
                No recurring missions configured yet — set one up from the Mission Planner&apos;s &ldquo;Recurring&rdquo; tab.
              </Typography>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <MetricTile label="Schedules" value={recurringMissions.length} icon={<Repeat />} />
                <MetricTile label="Enabled" value={recurringEnabledCount} icon={<Repeat />} />
                <MetricTile label="Running Now" value={recurringActiveCount} icon={<Repeat />} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Yield &amp; Production</CardTitle>
          </CardHeader>
          <CardContent>
            <Typography variant="small" className="text-foreground-muted">
              Data unavailable — no yield or production model exists in this application yet. {plotCount} plot{plotCount === 1 ? "" : "s"} tracked for
              sensor and mission data only.
            </Typography>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
