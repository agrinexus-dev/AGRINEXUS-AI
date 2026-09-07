"use client";

import { Bot, Wrench } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, EmptyState, MetricTile, Typography } from "@agrinexus/ui";

import { CROP_ISSUE_TYPE_LABELS } from "@/lib/findings/types";
import type { RobotEffectiveness } from "@/lib/analytics/historical-analytics-service";

/**
 * Robot Resolution — real robot-effectiveness
 * figures from `RobotEffectiveness`, computed from `CropFinding` rows where
 * `resolvedByRobotMissionId`/`correctiveActionType` are actually set (i.e. a
 * robot mission genuinely performed a simulated corrective action — never
 * inferred from a mission merely running). Average detection-to-resolution
 * time is shown only when at least one resolved finding has both real
 * timestamps; otherwise it's omitted rather than guessed.
 */
export function RobotResolutionCard({ effectiveness }: { effectiveness: RobotEffectiveness | null }) {
  if (!effectiveness || !effectiveness.hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Robot Resolution</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={<Bot />} title="Not enough historical data yet." description="Robot resolution activity will appear here once crop findings have been detected and, where a robot is capable, resolved." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Robot Resolution</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile label="Detected by Robots" value={effectiveness.issuesDetectedByRobots} icon={<Bot />} />
          <MetricTile label="Resolved by Robots" value={effectiveness.issuesResolvedByRobots} icon={<Wrench />} />
          <MetricTile
            label="Resolution Rate"
            value={effectiveness.resolutionRatePercent === null ? "Unavailable" : effectiveness.resolutionRatePercent}
            unit={effectiveness.resolutionRatePercent === null ? undefined : "%"}
            icon={<Wrench />}
          />
          <MetricTile
            label="Avg. Detection → Resolution"
            value={effectiveness.averageDetectionToResolutionMinutes === null ? "Unavailable" : effectiveness.averageDetectionToResolutionMinutes}
            unit={effectiveness.averageDetectionToResolutionMinutes === null ? undefined : "min"}
            icon={<Wrench />}
          />
        </div>

        {effectiveness.issueTypesResolved.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Typography variant="caption" className="text-foreground-subtle">
              Issue types resolved
            </Typography>
            <div className="flex flex-col gap-1.5">
              {effectiveness.issueTypesResolved.map((entry) => (
                <div key={entry.issueType} className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-2.5">
                  <Typography variant="small" className="text-foreground">
                    {CROP_ISSUE_TYPE_LABELS[entry.issueType]}
                  </Typography>
                  <Typography variant="caption" className="text-foreground-subtle">
                    {entry.count}
                  </Typography>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Typography variant="small" className="text-foreground-muted">
            No issue has been resolved by a robot yet.
          </Typography>
        )}

        {effectiveness.actionsUsed.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Typography variant="caption" className="text-foreground-subtle">
              Robot actions used
            </Typography>
            <div className="flex flex-wrap gap-1.5">
              {effectiveness.actionsUsed.map((entry) => (
                <div key={entry.actionType} className="rounded-md border border-border-subtle bg-surface/40 px-2.5 py-1 text-xs text-foreground-subtle">
                  {entry.actionType.replaceAll("-", " ")} × {entry.count}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
