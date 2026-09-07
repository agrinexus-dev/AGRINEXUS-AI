"use client";

import { Bug, CheckCircle2, TrendingUp } from "lucide-react";

import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, MetricTile, Typography } from "@agrinexus/ui";

import type { FindingsHistory } from "@/lib/analytics/historical-analytics-service";

/**
 * Findings Over Time — the real historical chart
 * `crop-findings-card.tsx` explicitly documented as missing ("no historical
 * finding-count time series to chart a trend from yet"). Built entirely from
 * `FindingsHistory.daily`, which `historical-analytics-service.ts` buckets
 * from REAL `CropFinding.detectedAt`/`resolvedAt` timestamps — never a
 * fabricated point. No charting library exists in this app (audited in
 * this app), so the trend is a hand-built CSS bar row, matching this
 * page's existing "Sensor Trends" convention.
 *
 * `crop-findings-card.tsx` stays as-is (severity/type/plot breakdown, live
 * from the client Finding Store) — this card is additive, not a
 * replacement, and covers only the time-series + resolution-rate angle that
 * card never had the data for.
 */
export function FindingsHistoryCard({ history }: { history: FindingsHistory | null }) {
  if (!history || !history.hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Findings Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={<TrendingUp />} title="Not enough historical data yet." description="Findings will appear here as drone and robot missions detect real crop conditions over time." />
        </CardContent>
      </Card>
    );
  }

  const maxCount = history.daily.reduce((max, point) => Math.max(max, point.detected, point.resolved), 0) || 1;
  const rangeLabel =
    history.earliestDetectedAt && history.latestDetectedAt
      ? `${new Date(history.earliestDetectedAt).toLocaleDateString()} – ${new Date(history.latestDetectedAt).toLocaleDateString()}`
      : "Unavailable";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Findings Over Time</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile label="Total Detected" value={history.totalDetected} icon={<Bug />} />
          <MetricTile label="Total Resolved" value={history.totalResolved} icon={<CheckCircle2 />} />
          <MetricTile
            label="Resolution Rate"
            value={history.resolutionRatePercent === null ? "Unavailable" : history.resolutionRatePercent}
            unit={history.resolutionRatePercent === null ? undefined : "%"}
            icon={<TrendingUp />}
          />
          <MetricTile label="Requires Human Action" value={history.totalRequiresHumanAction} icon={<Bug />} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Typography variant="caption" className="text-foreground-subtle">
              Daily detected vs. resolved
            </Typography>
            <Typography variant="caption" className="text-foreground-subtle">
              {rangeLabel}
            </Typography>
          </div>
          {history.daily.length <= 1 ? (
            <Typography variant="small" className="text-foreground-muted">
              Only one day of history recorded so far — the daily trend will fill in as more findings are detected.
            </Typography>
          ) : (
            <div className="flex items-end gap-1 overflow-x-auto pb-1">
              {history.daily.map((point) => (
                <div key={point.dateKey} className="flex min-w-[10px] flex-1 flex-col items-center gap-1" title={`${point.dateKey}: ${point.detected} detected, ${point.resolved} resolved`}>
                  <div className="flex h-20 w-full items-end justify-center gap-0.5">
                    <div
                      className="w-1/2 rounded-t bg-critical/70"
                      style={{ height: `${Math.max(2, (point.detected / maxCount) * 100)}%` }}
                      aria-hidden
                    />
                    <div
                      className="w-1/2 rounded-t bg-success/70"
                      style={{ height: `${Math.max(2, (point.resolved / maxCount) * 100)}%` }}
                      aria-hidden
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Badge intent="critical">Detected</Badge>
            <Badge intent="success">Resolved</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
