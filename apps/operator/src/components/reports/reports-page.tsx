"use client";

import { useEffect, useState } from "react";
import { BarChart3, FileText, ListChecks, Radio, Sprout } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  SectionHeader,
  Typography,
} from "@agrinexus/ui";

import { useFleetStore } from "@/lib/fleet/fleet-store";
import { useMissionStore } from "@/lib/missions/mission-store";
import { usePlotStore } from "@/lib/plots/plot-store";
import { buildReportPreview, type ReportKind, type ReportPreview } from "@/lib/reports/build-report";
import { useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";
import { useRobotStore } from "@/lib/robots/robot-store";
import { useAlertStore } from "@/lib/sensor-analytics/alert-store";
import { useSensorStore } from "@/lib/sensors/sensor-store";

const REPORT_CATEGORIES: { kind: ReportKind; title: string; description: string; icon: typeof FileText }[] = [
  { kind: "farm-summary", title: "Farm Summary", description: "Plots, sensor count, active alerts, and current recommendations.", icon: Sprout },
  { kind: "mission-report", title: "Mission Report", description: "Drone and robot mission counts by status, recent missions.", icon: ListChecks },
  { kind: "sensor-report", title: "Sensor Report", description: "Sensor inventory by type, offline count, weakest health scores.", icon: Radio },
  { kind: "analytics-report", title: "Analytics Report", description: "Farm-wide recommendation breakdown and anomaly count.", icon: BarChart3 },
];

/**
 * Reports — the sidebar's "Reports" destination.
 * There is no PDF/file-generation engine anywhere in this app, so this page
 * never claims one exists: "Generate" builds a real, live-data TEXT preview
 * (via `buildReportPreview`, reusing the exact same functions every other
 * page reads — no invented numbers) and shows it in a dialog, explicitly
 * labeled as a preview with export unavailable. Nothing here is persisted —
 * there's no report store, so "Recent Reports" honestly reflects only what
 * was generated in this session, not a fabricated history.
 *
 * `buildReportPreview` is async — the count/status/recent-
 * mission facts it assembles come from `GET /api/reports` (real Postgres
 * queries), not a `.getState()` snapshot that depended on some other page
 * having already hydrated these stores. The mount effect below hydrates
 * them anyway, so the plot-recommendation/sensor-health lines (still
 * genuinely client-computed — see `build-report.ts`'s doc comment) are
 * fresh too, even if Reports is the first page opened this session.
 */
export function ReportsPage() {
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [recent, setRecent] = useState<ReportPreview[]>([]);
  const [pendingKind, setPendingKind] = useState<ReportKind | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    void useSensorStore.getState().fetchSensors();
    void useAlertStore.getState().fetchAlerts();
    void usePlotStore.getState().fetchPlots();
    void useFleetStore.getState().fetchDrones();
    void useRobotStore.getState().fetchRobots();
    void useMissionStore.getState().fetchMissions();
    void useRobotMissionStore.getState().fetchRobotMissions();
  }, []);

  async function handleGenerate(kind: ReportKind) {
    setPendingKind(kind);
    setGenerateError(null);
    try {
      const report = await buildReportPreview(kind);
      setPreview(report);
      setRecent((current) => [report, ...current].slice(0, 10));
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : "Couldn't load report data.");
    } finally {
      setPendingKind(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-20">
      <SectionHeader
        title="Reports"
        description="Report previews generated from live farm data. There is no PDF/file export engine in this version — every report opens as an on-screen preview instead."
      />

      {generateError ? (
        <Typography variant="small" className="text-critical" role="alert">
          Couldn&apos;t load report data: {generateError}
        </Typography>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {REPORT_CATEGORIES.map(({ kind, title, description, icon: Icon }) => (
          <Card key={kind} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="size-4 text-foreground-muted" aria-hidden />
                {title}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-3">
              <Typography variant="small" className="text-foreground-muted">
                {description}
              </Typography>
              <Button intent="secondary" size="sm" onClick={() => handleGenerate(kind)} disabled={pendingKind === kind}>
                {pendingKind === kind ? "Generating…" : "Generate Preview"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title="No reports generated yet"
              description="Generate a preview above — nothing is stored between sessions, and no report history exists yet in this version."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {recent.map((report, index) => (
                <button
                  key={`${report.kind}-${report.generatedAt}-${index}`}
                  onClick={() => setPreview(report)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3 text-left transition-colors hover:bg-surface-elevated"
                >
                  <div className="flex flex-col gap-0.5">
                    <Typography variant="small" className="text-foreground">
                      {report.title}
                    </Typography>
                    <Typography variant="caption" className="text-foreground-subtle">
                      {new Date(report.generatedAt).toLocaleString()}
                    </Typography>
                  </div>
                  <Badge intent="neutral">Preview</Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Typography variant="caption" className="text-foreground-subtle">
              Generated {preview ? new Date(preview.generatedAt).toLocaleString() : ""} from live application data. This is an on-screen preview
              only — PDF/file export is not implemented in this version.
            </Typography>
            <pre className="max-h-96 overflow-y-auto rounded-lg border border-border-subtle bg-surface p-3 font-mono text-xs whitespace-pre-wrap text-foreground">
              {preview?.lines.join("\n") || "No data available."}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
