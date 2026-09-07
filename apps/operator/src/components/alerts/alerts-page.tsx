"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, MapPin, Search, TriangleAlert } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Input,
  SectionHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsList,
  TabsTrigger,
  Typography,
} from "@agrinexus/ui";

import { farmPlots } from "@/components/digital-twin/scene/farm-data";
import { CROP_ISSUE_TYPE_LABELS } from "@/lib/findings/types";
import { useMissions } from "@/lib/missions/mission-store";
import { useRobotMissions } from "@/lib/robot-missions/robot-mission-store";
import { useAlertHydration, useAlerts, useAlertStore } from "@/lib/sensor-analytics/alert-store";
import { getPlotRecommendation } from "@/lib/sensor-analytics/mission-integration";
import { useAlertSimulation } from "@/lib/sensor-analytics/use-alert-simulation";
import { ALERT_TYPE_LABELS, type SensorAlertRecord } from "@/lib/sensor-analytics/types";
import { useSensorStore } from "@/lib/sensors/sensor-store";
import { useSensorSimulation } from "@/lib/sensors/use-sensor-simulation";

type StatusFilter = "all" | "active" | "resolved";
type SeverityFilter = "all" | "warning" | "critical";

function formatTimestamp(ms: number): string {
  const diffMinutes = Math.round((Date.now() - ms) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  return new Date(ms).toLocaleDateString();
}

/**
 * Alerts (backend-backed) — the sidebar's
 * "Alerts" destination. Reuses the real Alert Store (`useAlertStore`,
 * "Smart Alerts") — there is no second alert state system here.
 * Alerts shown come from two, compatible sources feeding the SAME store:
 * `use-alert-simulation.ts` (live, real-time, evaluated against real
 * Sensor/Threshold Store data — unchanged) and `fetchAlerts()` (Prompt
 * 018B — loads whatever's durably persisted in Postgres for this farm on
 * mount). This page mounts `useAlertSimulation`/`useSensorSimulation`
 * itself (the same mounted-page-scoped lifecycle every simulation hook in
 * this app already follows) so alerts keep evaluating while this page is
 * open, exactly like the Sensor Analytics Center and Digital Twin do.
 */
export function AlertsPage() {
  useSensorSimulation();
  useAlertSimulation();

  const alerts = useAlerts();
  const sensors = useSensorStore((state) => state.sensors);
  const missions = useMissions();
  const robotMissions = useRobotMissions();
  const { status: hydration, error: hydrationError } = useAlertHydration();

  useEffect(() => {
    void useAlertStore.getState().fetchAlerts();
  }, []);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return alerts
      .filter((alert) => (statusFilter === "all" ? true : statusFilter === "active" ? alert.resolvedAt === null : alert.resolvedAt !== null))
      .filter((alert) => (severityFilter === "all" ? true : alert.severity === severityFilter))
      // A crop-finding alert has no `sensorName` (it's
      // ""), so search also matches its plot label/issue type instead.
      .filter(
        (alert) =>
          alert.sensorName.toLowerCase().includes(query) ||
          (alert.findingPlotLabel?.toLowerCase().includes(query) ?? false) ||
          (alert.findingIssueType ? CROP_ISSUE_TYPE_LABELS[alert.findingIssueType].toLowerCase().includes(query) : false),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [alerts, statusFilter, severityFilter, search]);

  const activeCount = alerts.filter((alert) => alert.resolvedAt === null).length;
  const criticalCount = alerts.filter((alert) => alert.resolvedAt === null && alert.severity === "critical").length;

  function plotForAlert(alert: SensorAlertRecord) {
    // A crop-finding alert already carries its own plot
    // reference directly (`findingPlotId`), no sensor lookup involved.
    if (alert.findingPlotId) return farmPlots.find((plot) => plot.id === alert.findingPlotId) ?? null;
    // `sensorId` is null once a backend-tracked alert's sensor has been
    // deleted — its plot/recommendation context is gone with
    // it, but `alert.sensorName` (still populated) keeps the alert itself
    // readable; see `SensorAlertRecord.sensorId`'s own doc comment.
    const sensor = alert.sensorId ? sensors[alert.sensorId] : undefined;
    if (!sensor?.assignedPlotId) return null;
    return farmPlots.find((plot) => plot.id === sensor.assignedPlotId) ?? null;
  }

  function relatedMissionFor(alert: SensorAlertRecord) {
    if (!alert.sensorId) return null;
    const sensorId = alert.sensorId;
    const drone = missions.find((mission) => mission.sensorJustification?.sourceSensorIds.includes(sensorId));
    if (drone) return { kind: "Drone", name: drone.name };
    const robot = robotMissions.find((mission) => mission.sensorJustification?.sourceSensorIds.includes(sensorId));
    if (robot) return { kind: "Robot", name: robot.name };
    return null;
  }

  return (
    <div className="flex flex-col gap-5 pb-20">
      <SectionHeader
        title="Alerts"
        description={`${activeCount} active alert${activeCount === 1 ? "" : "s"}${criticalCount > 0 ? ` (${criticalCount} critical)` : ""} — evaluated every 3 seconds against the current Threshold configuration.`}
      />

      {hydration === "error" ? (
        <div className="flex items-center gap-2 rounded-lg border border-critical/40 bg-critical-muted px-3 py-2">
          <TriangleAlert className="size-4 shrink-0 text-critical" aria-hidden />
          <Typography variant="small" className="text-critical">
            Couldn&apos;t load saved alerts from the server: {hydrationError}. Live alerts evaluated during this session are still shown below.
          </Typography>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="resolved">Resolved</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Select value={severityFilter} onValueChange={(value) => setSeverityFilter(value as SeverityFilter)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-foreground-subtle" aria-hidden />
              <Input placeholder="Search sensor…" value={search} onChange={(event) => setSearch(event.target.value)} className="w-44 pl-8" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {hydration === "loading" && alerts.length === 0 ? (
            <div className="flex flex-col gap-2" role="status" aria-label="Loading alerts">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<CheckCircle2 />} title="No matching alerts" description="Nothing matches the current filters right now." />
          ) : (
            filtered.map((alert) => {
              const plot = plotForAlert(alert);
              const recommendation = plot ? getPlotRecommendation(plot.id) : null;
              const relatedMission = relatedMissionFor(alert);
              const resolved = alert.resolvedAt !== null;

              const isFindingAlert = alert.alertType === "crop-finding";
              const title = isFindingAlert && alert.findingIssueType ? CROP_ISSUE_TYPE_LABELS[alert.findingIssueType] : ALERT_TYPE_LABELS[alert.alertType];

              return (
                <div key={alert.id} className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <Typography variant="small" className="font-medium text-foreground">
                          {title}
                        </Typography>
                        {isFindingAlert ? <Badge intent="neutral">Crop Finding</Badge> : <Badge intent="neutral">{alert.sensorName}</Badge>}
                        {plot ? <Badge intent="accent">{plot.label}</Badge> : null}
                      </div>
                      <Typography variant="caption" className="text-foreground-subtle">
                        {alert.message}
                      </Typography>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={resolved ? "nominal" : alert.severity === "critical" ? "critical" : "attention"} label={resolved ? "Resolved" : alert.severity === "critical" ? "Critical" : "Warning"} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-subtle">
                    <span>Opened {formatTimestamp(alert.createdAt)}</span>
                    {resolved ? <span>Resolved {formatTimestamp(alert.resolvedAt!)}</span> : null}
                    {relatedMission ? (
                      <span className="text-accent">
                        Related {relatedMission.kind.toLowerCase()} mission: {relatedMission.name}
                      </span>
                    ) : null}
                    {isFindingAlert && alert.findingPosition ? (
                      <span>
                        Position x={alert.findingPosition[0].toFixed(1)}, z={alert.findingPosition[1].toFixed(1)}
                      </span>
                    ) : null}
                  </div>

                  {/* The SAME persisted finding (`findingId`), not a second approximate location: opens the Digital Twin with `?focusFinding=<id>`, which selects the exact marker via the existing Details Panel. */}
                  {isFindingAlert && alert.findingId ? (
                    <Link
                      href={`/digital-twin?focusFinding=${encodeURIComponent(alert.findingId)}`}
                      className="inline-flex w-fit items-center gap-1.5 text-xs text-accent hover:underline"
                    >
                      <MapPin className="size-3.5" aria-hidden />
                      View on Digital Twin
                    </Link>
                  ) : null}

                  {recommendation && recommendation.action !== "unavailable" ? (
                    <div className="flex items-center gap-1.5 border-t border-border-subtle pt-2">
                      <AlertTriangle className="size-3.5 text-foreground-subtle" aria-hidden />
                      <Typography variant="caption" className="text-foreground-subtle">
                        Current recommendation for {plot?.label}: <span className="text-foreground">{recommendation.action}</span> —{" "}
                        {recommendation.reason}
                      </Typography>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
