"use client";

import { useState } from "react";
import { ListChecks, Repeat } from "lucide-react";

import { EmptyState, Tabs, TabsContent, TabsList, TabsTrigger, Typography } from "@agrinexus/ui";

import { useMissions, useMissionStore } from "@/lib/missions/mission-store";
import type { MissionRecord } from "@/lib/missions/types";

import { AutonomousBehaviorToggle } from "./autonomous-behavior-toggle";
import { MissionLibraryCard } from "./mission-library-card";
import { RecurringMissionsPanel } from "./recurring-missions-panel";

type MissionStatusTab = "active" | "queued" | "completed" | "cancelled";
type ViewMode = "missions" | "recurring";

function bucketOf(mission: MissionRecord): MissionStatusTab {
  if (mission.status === "queued") return "queued";
  if (mission.status === "completed") return "completed";
  if (mission.status === "cancelled") return "cancelled";
  // paused + every in-flight status (see MISSION_FLIGHT_STATUSES) read as "Active".
  return "active";
}

const STATUS_TAB_LABEL: Record<MissionStatusTab, string> = {
  active: "Active",
  queued: "Queued",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * The shared segmented-button look used by BOTH the
 * top-level Missions/Recurring switch and the 4-way status filter below it
 * (Part 2's own explicit ask: "Make the Mission/Recurring selector
 * visually consistent with these filters"). One class-string builder
 * instead of two independently-drifting className blocks, so width/
 * height/border/radius/spacing/typography/hover/active state can never
 * diverge between the two rows again.
 *
 * Used for two different element kinds: the top row's plain `<button>`s
 * (no Radix state at all — a `data-[state=active]:` selector is simply
 * inert/never matches there) and the status row's `TabsTrigger`s (which DO
 * carry a real `data-state` attribute, and whose own base styling already
 * sets `data-[state=active]:bg-surface-elevated/text-foreground/
 * shadow-panel` — see `Tabs.tsx`). Because a bare utility like `bg-accent/10`
 * and a `data-[state=active]:`-scoped one are different tailwind-merge
 * groups, passing only the bare classes would leave BOTH in the compiled
 * class list, and the browser's resolution between them isn't something
 * this codebase should depend on. So every "active" utility below is
 * emitted TWICE — once bare (for the plain-button case, and as this
 * element's actual default look) and once under the identical
 * `data-[state=active]:` modifier (so tailwind-merge dedupes it against,
 * and overrides, the base TabsTrigger's own active-state classes).
 *
 * `layout: "col"` is new. A live screenshot (not just
 * bounding-box checks alone) showed the 4-way status row's
 * single-line "Completed (0)"-style label genuinely overflowing its ~63px
 * column at this panel's fixed 300px width — text visibly running past
 * each button into the next one ("Queued (0)Completed (0)Cancelled (0"),
 * which is exactly the "broken pieces of one large button" look reported.
 * The row layout ("flex h-9... gap-1.5", one line) is still exactly right
 * for the top Missions/Recurring toggle, whose labels are short — this is
 * a genuinely NEW layout mode for the status row specifically, not a
 * rewrite of the row one.
 */
function segmentButtonClass(active: boolean, muted: boolean, layout: "row" | "col" = "row"): string {
  const structure =
    layout === "row"
      ? "flex h-9 items-center justify-center gap-1.5"
      : "flex h-12 flex-col items-center justify-center gap-0.5 py-1.5";
  return [
    structure,
    "rounded-lg border text-xs font-medium transition-colors duration-(--duration-fast) ease-standard",
    "shadow-none data-[state=active]:shadow-none",
    active
      ? "border-accent bg-accent/10 text-accent data-[state=active]:border-accent data-[state=active]:bg-accent/10 data-[state=active]:text-accent"
      : "border-border bg-surface text-foreground-subtle hover:border-foreground-subtle/40 hover:bg-surface-elevated hover:text-foreground",
    !active && muted ? "opacity-70" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Recurring Missions moved OUT of being just another
 * status-filter tab (buried as tab #5 of 5, wrapping to a second row and
 * visually identical to "Cancelled") and into its own top-level view,
 * switched by a separate, more prominent control right under the "Mission
 * Library" heading. This is a pure UI/discoverability fix — it still
 * renders the SAME `RecurringMissionsPanel` against the SAME
 * `useRecurringMissionStore`, nothing about the underlying
 * recurring-mission architecture changes.
 *
 * The button styling was rewritten (see `segmentButtonClass`
 * above — the previous version nested a bordered `TabsList` container
 * around 4 ALSO-bordered `TabsTrigger`s, producing a visible double
 * border/inconsistent spacing) and added the Autonomous Behavior toggle
 * .
 */
export function MissionLibrary() {
  const missions = useMissions();
  const selectedMissionId = useMissionStore((state) => state.selectedMissionId);
  const selectMission = useMissionStore((state) => state.selectMission);
  const [view, setView] = useState<ViewMode>("missions");
  const [statusTab, setStatusTab] = useState<MissionStatusTab>("active");

  const buckets: Record<MissionStatusTab, MissionRecord[]> = { active: [], queued: [], completed: [], cancelled: [] };
  for (const mission of missions) buckets[bucketOf(mission)].push(mission);

  return (
    <div className="flex h-full flex-col gap-3">
      <Typography variant="h4">Mission Library</Typography>

      <AutonomousBehaviorToggle vehicleKind="drone" />

      {/* Top-level: Normal Mission vs Recurring Mission — two different
          mission TYPES, not two more status filters, so this gets its own
          visually distinct row instead of hiding inside the tabs below. */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setView("missions")} className={segmentButtonClass(view === "missions", false)}>
          <ListChecks className="size-4" aria-hidden />
          Missions
        </button>
        <button type="button" onClick={() => setView("recurring")} className={segmentButtonClass(view === "recurring", false)}>
          <Repeat className="size-4" aria-hidden />
          Recurring
        </button>
      </div>

      {view === "recurring" ? (
        <div className="flex-1 overflow-y-auto">
          <RecurringMissionsPanel vehicleKind="drone" />
        </div>
      ) : (
        <Tabs value={statusTab} onValueChange={(value) => setStatusTab(value as MissionStatusTab)} className="flex flex-1 flex-col overflow-hidden">
          {/*
            Phase 5 Part 2 fix — the previous version overrode `bg-surface`
            and `p-1` here (via `cn()`/tailwind-merge, which correctly
            replaces conflicting utilities) but never overrode the base
            `border border-border`, since a border-WIDTH utility only
            conflicts with another border-WIDTH utility, not a border-COLOR
            one — so the container kept its own 1px border, nested around 4
            ALSO-bordered triggers below it. `border-0` here zeroes that
            width (no visible border regardless of color), which is the
            actual, minimal fix — no need to bypass `TabsList`/`TabsTrigger`
            via `asChild` (which would concatenate rather than merge
            classes and reintroduce the same class-conflict problem in a
            different form).
          */}
          <TabsList className="grid h-auto w-full grid-cols-4 gap-1.5 border-0 bg-transparent p-0">
            {(Object.keys(STATUS_TAB_LABEL) as MissionStatusTab[]).map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                className={`px-0.5 ${segmentButtonClass(statusTab === key, buckets[key].length === 0, "col")}`}
              >
                <span className="max-w-full truncate text-[10px] leading-none">{STATUS_TAB_LABEL[key]}</span>
                <span className="text-[10px] leading-none font-normal opacity-75">{buckets[key].length}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {(Object.keys(STATUS_TAB_LABEL) as MissionStatusTab[]).map((key) => (
            <TabsContent key={key} value={key} className="flex-1 overflow-y-auto">
              {buckets[key].length === 0 ? (
                <EmptyState icon={<ListChecks />} title={`No ${STATUS_TAB_LABEL[key].toLowerCase()} missions`} className="py-8" />
              ) : (
                <div className="flex flex-col gap-2">
                  {buckets[key].map((mission) => (
                    <MissionLibraryCard
                      key={mission.id}
                      mission={mission}
                      selected={mission.id === selectedMissionId}
                      onSelect={() => selectMission(mission.id)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
