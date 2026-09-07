"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Card, SectionHeader, Typography } from "@agrinexus/ui";

import { useAlertSimulation } from "@/lib/sensor-analytics/use-alert-simulation";
import { useHistoricalSensorSimulation } from "@/lib/sensor-analytics/use-historical-sensor-simulation";
import { useSensors } from "@/lib/sensors/sensor-store";
import { useSensorSimulation } from "@/lib/sensors/use-sensor-simulation";
import type { SensorType } from "@/lib/sensors/types";

import { AnalyticsOverview } from "./analytics-overview";
import { HistoricalDashboard } from "./historical-dashboard";
import { SensorIntelligencePanel } from "./sensor-intelligence-panel";

// Same bleed technique the Robot/Drone Mission Planner pages already use —
// duplicated here rather than shared, for the same reason those pages
// duplicate it: every page that already uses it is DO-NOT-MODIFY territory
// this change (or, for `missions-page.tsx`/`robot-missions-page.tsx`,
// simply out of scope), so this stays a self-contained ~15 lines rather
// than a new shared import touching files that already exist.
const BLEED_MARGIN_PX = 28;

/**
 * Sensor Analytics Center — mirrors the 3-panel Mission
 * Planner page shape: Analytics Overview (left), Historical Analytics
 * Dashboard (center), Sensor Intelligence (right). Every panel reads live
 * from the Sensor Store + the new Historical/Threshold/Alert stores this
 * prompt adds — nothing here duplicates state.
 */
export function SensorAnalyticsPage() {
  const sensors = useSensors();
  const [metricType, setMetricType] = useState<SensorType>("soil-moisture");

  // Keeps sensors drifting, history recording, and alerts evaluating while
  // this page is open — same mounted-page-scoped lifecycle every other
  // simulation hook in this app uses.
  useSensorSimulation();
  useHistoricalSensorSimulation();
  useAlertSimulation();

  const anchorRef = useRef<HTMLDivElement>(null);
  const [bleedStyle, setBleedStyle] = useState<CSSProperties>({});

  useEffect(() => {
    const anchor = anchorRef.current;
    const main = anchor?.closest("main");
    if (!anchor || !main) return;

    function recalc() {
      if (!anchor || !main) return;
      const mainRect = main.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const width = mainRect.width - BLEED_MARGIN_PX * 2;
      if (width <= 0) return;
      setBleedStyle({ marginLeft: mainRect.left + BLEED_MARGIN_PX - anchorRect.left, width, maxWidth: width });
    }

    recalc();
    const observer = new ResizeObserver(recalc);
    observer.observe(main);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={anchorRef}>
      <div style={bleedStyle} className="flex flex-col gap-4 pb-20">
        <SectionHeader
          title="Sensor Analytics Center"
          description="Historical trends, anomalies, and thresholds — computed from the same live sensor readings the Sensor Network and Digital Twin show."
          actions={
            <Link href="/sensor-network" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden />
              Back to Sensor Network
            </Link>
          }
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_340px]">
          <AnalyticsOverview sensors={sensors} />

          <Card className="h-[78vh] min-h-[600px] overflow-hidden p-0">
            <div className="h-full overflow-y-auto p-4">
              <HistoricalDashboard sensors={sensors} metricType={metricType} onMetricTypeChange={setMetricType} />
            </div>
          </Card>

          <Card className="h-[78vh] min-h-[600px] overflow-hidden p-3">
            <SensorIntelligencePanel sensors={sensors} metricType={metricType} />
          </Card>
        </div>

        <Typography variant="caption" className="text-foreground-subtle">
          Sensor analytics — historical data is simulated (backfilled from each sensor&apos;s live drift model, then extended by real readings while this page or the Sensor Network/Digital Twin pages are open).
        </Typography>
      </div>
    </div>
  );
}
