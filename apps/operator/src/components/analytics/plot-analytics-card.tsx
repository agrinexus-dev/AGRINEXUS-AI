"use client";

import { useState } from "react";
import { AlertTriangle, Sprout } from "lucide-react";

import { Badge, Card, CardContent, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge, Typography, type Status } from "@agrinexus/ui";

import type { PlotHealthOverview } from "@/lib/analytics/historical-analytics-service";
import { useFindingsForPlot } from "@/lib/findings/finding-store";
import { usePlots } from "@/lib/plots/plot-store";
import { useActiveAlerts } from "@/lib/sensor-analytics/alert-store";
import { useHistoricalStore } from "@/lib/sensor-analytics/historical-store";
import { getPlotRecommendation } from "@/lib/sensor-analytics/mission-integration";
import type { PlotRecommendation } from "@/lib/sensor-analytics/reasoning-engine";
import { ALERT_TYPE_LABELS } from "@/lib/sensor-analytics/types";
import { computeTrendStats, detectAnomalies } from "@/lib/sensor-analytics/trend-analysis";
import { useSensors } from "@/lib/sensors/sensor-store";
import { formatSensorReading, SENSOR_STATUS_LABELS, SENSOR_TYPE_LABELS } from "@/lib/sensors/types";

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
 * Plot Analytics — the piece the audited "Plot A-only"
 * experience was missing: a real selector, backed by the farm-scoped Plot
 * Store/API (`usePlots()` — NOT the static `farmPlots` array directly), that
 * lets an operator inspect ANY real farm plot, not only whichever one
 * happens to have a soil-moisture sensor. Every value below is either:
 *  - a real per-sensor reading/trend from the Sensor/Historical Store,
 *  scoped to whatever sensors this plot actually has assigned (any type,
 *  not just soil moisture/temperature — the Agricultural Reasoning
 *  Engine's recommendation still only reasons about soil moisture/
 *  temperature/alerts, exactly as it always has; this card additionally
 *  surfaces every OTHER real sensor a plot has, which the reasoning
 *  engine was never designed to summarize),
 *  - the same Agricultural Reasoning Engine recommendation AURA and the
 *  Digital Twin Details Panel already use (`getPlotRecommendation`), or
 *  - an explicit "no data" state — never a fabricated number.
 *
 * Additionally accepts `plotHealth` — the server-computed
 * per-plot historical rollup (`historical-analytics-service.ts`'s
 * `getPlotHealthOverviews`) — and, when the selected plot has an entry,
 * renders its real recent mission-activity and robot-intervention counts
 * underneath the existing live sensor/alert/finding sections above. `null`/
 * a missing entry renders nothing extra rather than a fabricated "0".
 */
export function PlotAnalyticsCard({ plotHealth }: { plotHealth?: PlotHealthOverview[] | null }) {
  const plots = usePlots();
  const sensors = useSensors();
  const samplesBySensorId = useHistoricalStore((state) => state.samples);
  const activeAlerts = useActiveAlerts();

  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);
  const plotId = selectedPlotId && plots.some((plot) => plot.id === selectedPlotId) ? selectedPlotId : (plots[0]?.id ?? null);
  const plot = plots.find((candidate) => candidate.id === plotId) ?? null;
  // Same real Finding Store every other surface reads
  // from. Called unconditionally (before the early return below) — React's
  // Rules of Hooks — so it takes `plotId` directly rather than `plot.id`.
  const plotFindings = useFindingsForPlot(plotId);

  if (!plot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Plot Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <Typography variant="small" className="text-foreground-muted">
            No plots found for this farm.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const recommendation = getPlotRecommendation(plot.id);
  const plotSensors = sensors.filter((sensor) => sensor.assignedPlotId === plot.id);
  const plotSensorIds = new Set(plotSensors.map((sensor) => sensor.id));
  const plotAlerts = activeAlerts.filter((alert) => alert.sensorId !== null && plotSensorIds.has(alert.sensorId));
  const anomalyCount = plotSensors.reduce((sum, sensor) => sum + detectAnomalies(samplesBySensorId[sensor.id] ?? []).length, 0);
  const unresolvedFindingCount = plotFindings.filter((finding) => finding.status !== "resolved").length;
  const health = plotHealth?.find((entry) => entry.plotId === plot.id) ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Plot Analytics</CardTitle>
        <Select value={plot.id} onValueChange={setSelectedPlotId}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {plots.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3">
          <div className="flex flex-col gap-0.5">
            <Typography variant="small" className="font-medium text-foreground">
              {recommendation.plotLabel} recommendation
            </Typography>
            <Typography variant="caption" className="text-foreground-subtle">
              {recommendation.reason}
            </Typography>
          </div>
          <StatusBadge status={RECOMMENDATION_BADGE[recommendation.action]} label={RECOMMENDATION_LABEL[recommendation.action]} />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MiniStat label="Sensors" value={plotSensors.length} />
          <MiniStat label="Active Alerts" value={plotAlerts.length} />
          <MiniStat label="Anomalies (24h)" value={anomalyCount} />
          <MiniStat label="Crop Findings" value={plotFindings.length} />
          <MiniStat label="Confidence" value={recommendation.confidence ? capitalize(recommendation.confidence) : "Unavailable"} />
        </div>
        {plotFindings.length > 0 ? (
          <Typography variant="caption" className="text-foreground-subtle">
            {unresolvedFindingCount} unresolved of {plotFindings.length} crop finding{plotFindings.length === 1 ? "" : "s"} on {plot.label}.
          </Typography>
        ) : null}

        <div className="flex flex-col gap-2">
          <Typography variant="caption" className="text-foreground-subtle">
            Sensors assigned to {plot.label}
          </Typography>
          {plotSensors.length === 0 ? (
            <Typography variant="small" className="text-foreground-muted">
              No sensors assigned to {plot.label}.
            </Typography>
          ) : (
            plotSensors.map((sensor) => {
              const samples = samplesBySensorId[sensor.id] ?? [];
              const trend = samples.length >= 2 ? computeTrendStats(samples) : null;
              return (
                <div key={sensor.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface/60 p-3">
                  <div className="flex flex-col gap-0.5">
                    <Typography variant="small" className="text-foreground">
                      {sensor.name} <span className="text-foreground-subtle">— {SENSOR_TYPE_LABELS[sensor.sensorType]}</span>
                    </Typography>
                    <Typography variant="caption" className="text-foreground-subtle">
                      {formatSensorReading(sensor)} · {SENSOR_STATUS_LABELS[sensor.status]} · Battery {sensor.batteryPercent}%
                    </Typography>
                  </div>
                  <Typography variant="caption" className="text-foreground-subtle">
                    {trend ? `Trend: ${trend.direction} (${trend.strength})` : "Insufficient historical data"}
                  </Typography>
                </div>
              );
            })
          )}
        </div>

        {plotAlerts.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Typography variant="caption" className="text-foreground-subtle">
              Active alerts for {plot.label}
            </Typography>
            {plotAlerts.map((alert) => (
              <div key={alert.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-foreground-muted" aria-hidden />
                  <Typography variant="small" className="text-foreground">
                    {ALERT_TYPE_LABELS[alert.alertType]}
                  </Typography>
                </div>
                <Badge intent={alert.severity === "critical" ? "critical" : "warning"}>{alert.severity}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <Typography variant="caption" className="text-foreground-subtle">
            No active alerts for {plot.label}.
          </Typography>
        )}

        {health ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface/60 p-3">
            <Typography variant="caption" className="text-foreground-subtle">
              Historical activity on {plot.label}
            </Typography>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Drone Missions" value={health.droneMissionCount} />
              <MiniStat label="Robot Missions" value={health.robotMissionCount} />
              <MiniStat label="Resolved Findings" value={health.resolvedFindings} />
              <MiniStat label="Robot Interventions" value={health.robotInterventions} />
            </div>
            <Typography variant="caption" className="text-foreground-subtle">
              {health.lastMissionAt ? `Last mission activity: ${new Date(health.lastMissionAt).toLocaleString()}.` : "No mission has targeted this plot yet."}
            </Typography>
          </div>
        ) : null}

        <Typography variant="caption" className="flex items-center gap-1.5 text-foreground-subtle">
          <Sprout className="size-3.5" aria-hidden />
          Crop stage: {capitalize(plot.growthStage)} (farm layout data) — ask AURA &ldquo;Compare {plot.label} and{" "}
          {plots.find((candidate) => candidate.id !== plot.id)?.label ?? "another plot"}&rdquo; for a conversational comparison.
        </Typography>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border-subtle bg-surface/60 p-3">
      <Typography variant="caption" className="text-foreground-subtle">
        {label}
      </Typography>
      <Typography variant="h4">{value}</Typography>
    </div>
  );
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
}
