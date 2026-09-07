"use client";

import { CheckCircle2, ListChecks, Repeat, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, EmptyState, MetricTile, Typography } from "@agrinexus/ui";

import type { MissionActivityHistory } from "@/lib/analytics/historical-analytics-service";

/**
 * Mission Activity — historical drone/robot
 * mission counts from `MissionActivityHistory`, which
 * `historical-analytics-service.ts` computes from every REAL
 * `DroneMission`/`RobotMission` row on the farm (not just the currently-
 * active ones the existing "Active Missions" card already shows). No
 * "failed" figure is shown — the schema records only `completed`/
 * `cancelled` as terminal states (confirmed by audit);
 * showing a "failed" metric here would be fabricated.
 */
export function MissionActivityHistoryCard({ history }: { history: MissionActivityHistory | null }) {
  if (!history || !history.hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mission Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={<ListChecks />} title="Not enough historical data yet." description="Mission history will appear here once drone or robot missions have been created and run." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mission Activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <VehicleActivity label="Drone Missions" activity={history.drone} />
          <VehicleActivity label="Robot Missions" activity={history.robot} />
        </div>
      </CardContent>
    </Card>
  );
}

function VehicleActivity({ label, activity }: { label: string; activity: MissionActivityHistory["drone"] }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3">
      <Typography variant="small" className="font-medium text-foreground">
        {label}
      </Typography>
      <div className="grid grid-cols-3 gap-2">
        <MetricTile label="Total" value={activity.total} icon={<ListChecks />} />
        <MetricTile label="Completed" value={activity.completed} icon={<CheckCircle2 />} />
        <MetricTile label="Cancelled" value={activity.cancelled} icon={<XCircle />} />
      </div>
      <Typography variant="caption" className="flex items-center gap-1.5 text-foreground-subtle">
        <Repeat className="size-3.5" aria-hidden />
        {activity.recurringRuns} run{activity.recurringRuns === 1 ? "" : "s"} came from a recurring schedule.
      </Typography>
      {activity.byPlot.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Typography variant="caption" className="text-foreground-subtle">
            By plot
          </Typography>
          {activity.byPlot.map((entry) => (
            <div key={entry.plotId} className="flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-surface/40 px-2.5 py-1.5">
              <Typography variant="small" className="text-foreground">
                {entry.plotLabel}
              </Typography>
              <Typography variant="caption" className="text-foreground-subtle">
                {entry.total} mission{entry.total === 1 ? "" : "s"}
              </Typography>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
