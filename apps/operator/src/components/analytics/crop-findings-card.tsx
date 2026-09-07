"use client";

import { Bug, CheckCircle2, ClipboardList } from "lucide-react";

import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, MetricTile, Typography } from "@agrinexus/ui";

import { useFindings } from "@/lib/findings/finding-store";
import { CROP_ISSUE_SEVERITIES, CROP_ISSUE_TYPE_LABELS, CROP_ISSUE_TYPES, type CropIssueSeverity, type CropIssueType } from "@/lib/findings/types";
import { usePlots } from "@/lib/plots/plot-store";

const SEVERITY_LABEL: Record<CropIssueSeverity, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

/**
 * Crop Findings — the farm-wide rollup Analytics was
 * missing: every number here is computed directly from the same Finding
 * Store the Mission Inspectors, Digital Twin markers, and AURA already read
 * from (`useFindings()`) — never a second aggregate, never fabricated. An
 * honest empty state when no mission has detected anything yet, exactly
 * like every other card on this page.
 */
export function CropFindingsCard() {
  const findings = useFindings();
  const plots = usePlots();

  if (findings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Crop Findings</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Bug />}
            title="No crop findings yet"
            description="Run a drone or robot inspection mission to start detecting real crop conditions — findings will appear here as they're recorded."
          />
        </CardContent>
      </Card>
    );
  }

  const resolvedCount = findings.filter((finding) => finding.status === "resolved").length;
  const requiresHumanActionCount = findings.filter((finding) => finding.status === "requires-human-action").length;
  const unresolvedCount = findings.length - resolvedCount;

  const bySeverity: Record<CropIssueSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const finding of findings) bySeverity[finding.severity] += 1;

  const byType = new Map<CropIssueType, number>();
  for (const finding of findings) byType.set(finding.issueType, (byType.get(finding.issueType) ?? 0) + 1);
  const topTypes = CROP_ISSUE_TYPES.map((type) => ({ type, count: byType.get(type) ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  const perPlot = plots
    .map((plot) => ({ plot, count: findings.filter((finding) => finding.plotId === plot.id).length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  // "Inspection activity" — the last 24h is the honest, real-data-bound
  // signal available (there's no historical finding-count time series to
  // chart a trend from yet; see the final report's Part T).
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const detectedLast24h = findings.filter((finding) => finding.detectedAt >= oneDayAgo).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crop Findings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile label="Total Findings" value={findings.length} icon={<Bug />} />
          <MetricTile label="Resolved" value={resolvedCount} icon={<CheckCircle2 />} />
          <MetricTile label="Unresolved" value={unresolvedCount} icon={<ClipboardList />} />
          <MetricTile label="Detected (24h)" value={detectedLast24h} icon={<ClipboardList />} />
        </div>

        <div className="flex flex-col gap-2">
          <Typography variant="caption" className="text-foreground-subtle">
            By severity
          </Typography>
          <div className="flex flex-wrap gap-2">
            {CROP_ISSUE_SEVERITIES.map((severity) => (
              <Badge key={severity} intent={severity === "critical" || severity === "high" ? "critical" : severity === "medium" ? "warning" : "neutral"}>
                {SEVERITY_LABEL[severity]}: {bySeverity[severity]}
              </Badge>
            ))}
            {requiresHumanActionCount > 0 ? <Badge intent="warning">Needs human action: {requiresHumanActionCount}</Badge> : null}
          </div>
        </div>

        {topTypes.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Typography variant="caption" className="text-foreground-subtle">
              By issue type
            </Typography>
            <div className="flex flex-col gap-1.5">
              {topTypes.map(({ type, count }) => (
                <div key={type} className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-2.5">
                  <Typography variant="small" className="text-foreground">
                    {CROP_ISSUE_TYPE_LABELS[type]}
                  </Typography>
                  <Typography variant="caption" className="text-foreground-subtle">
                    {count}
                  </Typography>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {perPlot.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Typography variant="caption" className="text-foreground-subtle">
              By plot
            </Typography>
            <div className="flex flex-col gap-1.5">
              {perPlot.map(({ plot, count }) => (
                <div key={plot.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-2.5">
                  <Typography variant="small" className="text-foreground">
                    {plot.label}
                  </Typography>
                  <Typography variant="caption" className="text-foreground-subtle">
                    {count} finding{count === 1 ? "" : "s"}
                  </Typography>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
