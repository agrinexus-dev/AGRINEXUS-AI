"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Card, SectionHeader, Typography } from "@agrinexus/ui";

import { useAutonomousBehaviorScheduler } from "@/lib/autonomous/autonomous-behavior";
import { useFindingStore } from "@/lib/findings/finding-store";
import { useMissionHydration, useMissionStore } from "@/lib/missions/mission-store";
import { useRecurringMissionScheduler, useRecurringMissionStore } from "@/lib/recurring-missions/recurring-mission-store";

import { MissionInspector } from "./mission-inspector";
import { MissionLibrary } from "./mission-library";
import { MissionPlannerViewport } from "./mission-planner-viewport";

// Same bleed technique `digital-twin-page.tsx` already uses — the
// shell's ContentArea centers pages in a `max-w-6xl` column, which would
// squeeze this page's 3-panel layout (particularly the center Scene
// viewport) into an oddly narrow, portrait-ish canvas. Duplicated here
// rather than importing from that page (intentionally not modified
// — it's ~15 lines of plain layout math, not shared
// business logic.
const BLEED_MARGIN_PX = 28;

/**
 * Mission Planning & Flight Operations — a new, additive page
 * at `/drone-fleet/missions`. Three-panel enterprise UAV planner layout:
 * Mission Library (left), Mission Planner (center, the reused Digital Twin
 * Scene), Mission Inspector (right). Every panel reads the SAME Mission
 * Store / Fleet Store the rest of the app uses — no separate mock data.
 */
export function MissionsPage() {
  // AURA Natural-Language-Actions phase — mission progression
  // (`useMissionSimulation`) is now mounted once at the app-shell level
  // (`AppShell`), not per-page, so it's no longer called here (would
  // double-tick every mission if it were — see that hook's own doc comment).
  // Same mounted-page-scoped lifecycle as the simulation
  // hooks above; see `recurring-mission-store.ts`'s own doc comment.
  useRecurringMissionScheduler();
  // Same mounted-page-scoped lifecycle; keeps
  // autonomous drone behavior reconciled while this page is open.
  useAutonomousBehaviorScheduler();
  const { status: hydrationStatus, error: hydrationError } = useMissionHydration();

  // Loads whatever's durable in Postgres beyond any missions already created
  // this session — one-time on mount, merge-by-id, mirrors
  // every other 018x store's own hydration effect.
  useEffect(() => {
    void useMissionStore.getState().fetchMissions();
  }, []);

  // Same one-time hydration, so the Mission
  // Inspector's findings section shows a mission's past detections even on
  // a fresh page load that never visited the Digital Twin first.
  useEffect(() => {
    void useFindingStore.getState().fetchFindings();
  }, []);

  useEffect(() => {
    void useRecurringMissionStore.getState().fetchRecurringMissions();
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
          title="Mission Planning & Flight Operations"
          description="Plan, launch, and track drone missions on the same farm the Digital Twin renders."
          actions={
            <Link href="/drone-fleet" className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden />
              Back to Drone Fleet
            </Link>
          }
        />

        {hydrationStatus === "error" ? (
          <Typography variant="small" className="text-critical" role="alert">
            Couldn&apos;t load saved missions: {hydrationError}
          </Typography>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr_340px]">
          <Card className="h-[78vh] min-h-[600px] overflow-hidden p-3">
            <MissionLibrary />
          </Card>

          <div className="h-[78vh] min-h-[600px]">
            <MissionPlannerViewport />
          </div>

          <Card className="h-[78vh] min-h-[600px] overflow-hidden p-3">
            <MissionInspector />
          </Card>
        </div>

        <Typography variant="caption" className="text-foreground-subtle">
          Mission simulation — no live drone connection yet. Progress, battery, and ETA are computed estimates.
        </Typography>
      </div>
    </div>
  );
}
