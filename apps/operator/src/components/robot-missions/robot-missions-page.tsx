"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Card, SectionHeader, Typography } from "@agrinexus/ui";

import { useAutonomousBehaviorScheduler } from "@/lib/autonomous/autonomous-behavior";
import { useFindingStore } from "@/lib/findings/finding-store";
import { useRecurringMissionScheduler, useRecurringMissionStore } from "@/lib/recurring-missions/recurring-mission-store";
import { useRobotMissionHydration, useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";

import { RobotMissionInspector } from "./robot-mission-inspector";
import { RobotMissionLibrary } from "./robot-mission-library";
import { RobotMissionPlannerViewport } from "./robot-mission-planner-viewport";

// Same bleed technique `missions-page.tsx` (drones, 014B) already uses —
// duplicated here rather than imported/shared, for the same reason that file
// duplicates it from `digital-twin-page.tsx`: keeping every DO-NOT-MODIFY
// file in this change's list (and 014B's own page, also left untouched)
// completely unchanged.
const BLEED_MARGIN_PX = 28;

/**
 * Robot Mission Planning Center — a new, additive page at
 * `/ground-robots/missions`, mirroring `MissionsPage` (drones) exactly:
 * three-panel layout — Mission Library (left), Mission Planner (center, the
 * reused Digital Twin Scene), Mission Inspector (right). Every panel reads
 * the SAME Robot Mission Store / Robot Store the rest of the app uses.
 */
export function RobotMissionsPage() {
  // AURA Natural-Language-Actions phase — mission progression
  // (`useRobotMissionSimulation`) is now mounted once at the app-shell level
  // (`AppShell`), not per-page, so it's no longer called here (would
  // double-tick every mission if it were — see that hook's own doc comment).
  // Same mounted-page-scoped lifecycle as the simulation
  // hooks above.
  useRecurringMissionScheduler();
  // Same mounted-page-scoped lifecycle; keeps
  // autonomous robot behavior reconciled while this page is open.
  useAutonomousBehaviorScheduler();
  const { status: hydrationStatus, error: hydrationError } = useRobotMissionHydration();

  // Loads whatever's durable in Postgres beyond any robot missions already
  // created this session — one-time on mount, merge-by-id,
  // mirrors `MissionsPage`'s own `fetchMissions()` effect.
  useEffect(() => {
    void useRobotMissionStore.getState().fetchRobotMissions();
  }, []);

  useEffect(() => {
    void useRecurringMissionStore.getState().fetchRecurringMissions();
  }, []);

  // Same one-time hydration as `MissionsPage`.
  useEffect(() => {
    void useFindingStore.getState().fetchFindings();
  }, []);

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
          title="Robot Mission Planning Center"
          description="Plan, dispatch, and track ground robot missions on the same farm the Digital Twin renders."
          actions={
            <Link href="/ground-robots" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden />
              Back to Ground Robots
            </Link>
          }
        />

        {hydrationStatus === "error" ? (
          <Typography variant="small" className="text-critical" role="alert">
            Couldn&apos;t load saved robot missions: {hydrationError}
          </Typography>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr_340px]">
          <Card className="h-[78vh] min-h-[600px] overflow-hidden p-3">
            <RobotMissionLibrary />
          </Card>

          <div className="h-[78vh] min-h-[600px]">
            <RobotMissionPlannerViewport />
          </div>

          <Card className="h-[78vh] min-h-[600px] overflow-hidden p-3">
            <RobotMissionInspector />
          </Card>
        </div>

        <Typography variant="caption" className="text-foreground-subtle">
          Robot mission simulation — no live robot connection yet. Progress, battery, and ETA are computed estimates.
        </Typography>
      </div>
    </div>
  );
}
