"use client";

import { useState } from "react";
import { ListChecks, Repeat } from "lucide-react";

import { EmptyState, Tabs, TabsContent, TabsList, TabsTrigger, Typography } from "@agrinexus/ui";

import { AutonomousBehaviorToggle } from "@/components/missions/autonomous-behavior-toggle";
import { RecurringMissionsPanel } from "@/components/missions/recurring-missions-panel";
import { useRobotMissions, useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";
import type { RobotMissionRecord } from "@/lib/robot-missions/types";

import { RobotMissionLibraryCard } from "./robot-mission-library-card";

type MissionStatusTab = "active" | "queued" | "completed" | "cancelled";
type ViewMode = "missions" | "recurring";

function bucketOf(mission: RobotMissionRecord): MissionStatusTab {
  if (mission.status === "queued") return "queued";
  if (mission.status === "completed") return "completed";
  if (mission.status === "cancelled") return "cancelled";
  // paused + every in-progress status (see ROBOT_MISSION_ACTIVE_STATUSES) read as "Active".
  return "active";
}

const STATUS_TAB_LABEL: Record<MissionStatusTab, string> = {
  active: "Active",
  queued: "Queued",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Mirrors `mission-library.tsx`'s identical `segmentButtonClass`; see
 * that file's own doc comment both for
 * why every "active" utility is emitted twice, and for `layout: "col"`
 * (added after a live screenshot showed this row's single-line
 * "Completed (0)" labels genuinely overflowing/overlapping at this panel's
 * width).
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

/** Mirrors `mission-library.tsx`'s identical top-level Missions/Recurring split, polished button styling, and Autonomous Behavior toggle; see that file's own doc comments. */
export function RobotMissionLibrary() {
  const missions = useRobotMissions();
  const selectedMissionId = useRobotMissionStore((state) => state.selectedMissionId);
  const selectMission = useRobotMissionStore((state) => state.selectMission);
  const [view, setView] = useState<ViewMode>("missions");
  const [statusTab, setStatusTab] = useState<MissionStatusTab>("active");

  const buckets: Record<MissionStatusTab, RobotMissionRecord[]> = { active: [], queued: [], completed: [], cancelled: [] };
  for (const mission of missions) buckets[bucketOf(mission)].push(mission);

  return (
    <div className="flex h-full flex-col gap-3">
      <Typography variant="h4">Mission Library</Typography>

      <AutonomousBehaviorToggle vehicleKind="robot" />

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
          <RecurringMissionsPanel vehicleKind="robot" />
        </div>
      ) : (
        <Tabs value={statusTab} onValueChange={(value) => setStatusTab(value as MissionStatusTab)} className="flex flex-1 flex-col overflow-hidden">
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
                    <RobotMissionLibraryCard
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
