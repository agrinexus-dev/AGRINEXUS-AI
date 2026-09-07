"use client";

import { Copy, Pause, Play, Repeat, Route, Trash2, X } from "lucide-react";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Divider,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Typography,
  type Status,
} from "@agrinexus/ui";

import { farmPlots } from "@/components/digital-twin/scene/farm-data";
import { useFleetDrones } from "@/lib/fleet/fleet-store";
import { buildInspectionSummary, useFindingsForMission } from "@/lib/findings/finding-store";
import { CROP_ISSUE_SEVERITY_LABELS, CROP_ISSUE_TYPE_LABELS, describeFindingStatus, type CropFinding } from "@/lib/findings/types";
import { useMissionStore, useSelectedMission } from "@/lib/missions/mission-store";
import { MISSION_FLIGHT_STATUSES, MISSION_STATUS_LABELS, MISSION_TYPE_LABELS, type MissionStatus } from "@/lib/missions/types";
import { useRecurringMissionStore } from "@/lib/recurring-missions/recurring-mission-store";

const MISSION_STATUS_BADGE: Record<MissionStatus, Status> = {
  queued: "info",
  preparing: "nominal",
  "taking-off": "nominal",
  surveying: "nominal",
  returning: "nominal",
  landing: "nominal",
  completed: "nominal",
  paused: "attention",
  cancelled: "offline",
};

export function MissionInspector() {
  const mission = useSelectedMission();
  const drones = useFleetDrones();
  const store = useMissionStore();
  const findings = useFindingsForMission(mission?.id ?? null);
  const recurringConfig = useRecurringMissionStore((state) => (mission?.recurringConfigId ? (state.configs[mission.recurringConfigId] ?? null) : null));

  if (!mission) {
    return (
      <Card className="flex h-full flex-col items-center justify-center p-0">
        <EmptyState
          icon={<Route />}
          title="No mission selected"
          description="Select a mission from the library, or click a plot in the planner to create one."
          className="border-none"
        />
      </Card>
    );
  }

  const plot = farmPlots.find((candidate) => candidate.id === mission.targetPlotId);
  // Every automated (non-manual) mission with a
  // target plot scans it as it flies the generated path; no separate
  // "inspection mode" toggle/field exists (or is needed) since scanning is
  // intrinsic to the survey pattern itself. "Manual Flight" is the one type
  // that skips it — a human joystick-flying the drone isn't running the
  // automated coverage pattern proximity detection relies on.
  const inspectionEnabled = mission.missionType !== "manual" && Boolean(mission.targetPlotId);
  const isQueued = mission.status === "queued";
  const canGeneratePath = isQueued && Boolean(mission.assignedDroneId);
  const canStart = isQueued && mission.waypoints.length > 0;
  const canPause = MISSION_FLIGHT_STATUSES.includes(mission.status);
  const canResume = mission.status === "paused";
  const canCancel = mission.status !== "completed" && mission.status !== "cancelled";

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle>{mission.name}</CardTitle>
            <Typography variant="caption">{MISSION_TYPE_LABELS[mission.missionType]}</Typography>
            {inspectionEnabled ? (
              <Typography variant="caption" className="text-foreground-subtle">
                Inspection scanning active — this mission scans {plot?.label ?? "its target plot"} for crop issues as it flies.
              </Typography>
            ) : null}
            {recurringConfig ? (
              <Typography variant="caption" className="flex items-center gap-1 text-accent">
                <Repeat className="size-3" aria-hidden />
                Run of recurring schedule &ldquo;{recurringConfig.name}&rdquo; (every {recurringConfig.intervalMinutes} min)
              </Typography>
            ) : null}
          </div>
          <StatusBadge status={MISSION_STATUS_BADGE[mission.status]} label={MISSION_STATUS_LABELS[mission.status]} />
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          <InspectorRow label="Target Plot" value={plot?.label ?? "None"} />

          <div className="flex flex-col gap-1.5">
            <Typography variant="caption" className="text-foreground-subtle">
              Assigned Drone
            </Typography>
            <Select
              value={mission.assignedDroneId ?? "__none"}
              onValueChange={(value) => store.assignDrone(mission.id, value === "__none" ? null : value)}
              disabled={!isQueued}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Unassigned</SelectItem>
                {drones.map((drone) => (
                  <SelectItem key={drone.id} value={drone.id}>
                    {drone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Flight Parameters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Altitude (m)"
              value={mission.altitude}
              disabled={!isQueued}
              onChange={(value) => store.updateMissionSettings(mission.id, { altitude: value })}
            />
            <NumberField
              label="Flight Speed (m/s)"
              value={mission.speedMps}
              disabled={!isQueued}
              onChange={(value) => store.updateMissionSettings(mission.id, { speedMps: value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Side Overlap %"
              value={mission.sideOverlapPercent}
              disabled={!isQueued}
              onChange={(value) => store.updateMissionSettings(mission.id, { sideOverlapPercent: value })}
            />
            <NumberField
              label="Front Overlap %"
              value={mission.frontOverlapPercent}
              disabled={!isQueued}
              onChange={(value) => store.updateMissionSettings(mission.id, { frontOverlapPercent: value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estimates</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {mission.estimate ? (
            <>
              <InspectorRow label="Coverage %" value={`${mission.estimate.coveragePercent}%`} />
              <InspectorRow label="Estimated Images" value={String(mission.estimate.imageCount)} />
              <InspectorRow label="Estimated Battery" value={`${mission.estimate.batteryPercent}%`} />
              <InspectorRow label="Estimated Time" value={`${mission.estimate.durationMinutes} min`} />
              <Divider />
              <InspectorRow label="Progress" value={`${Math.round(mission.progressPercent)}%`} />
              <InspectorRow label="Coverage Progress" value={`${Math.round(mission.coverageProgressPercent)}%`} />
              {mission.headingDegrees !== null ? <InspectorRow label="Drone Heading" value={`${Math.round(mission.headingDegrees)}°`} /> : null}
            </>
          ) : (
            <Typography variant="small">Generate a flight path to see coverage, image, battery, and time estimates.</Typography>
          )}
        </CardContent>
      </Card>

      {inspectionEnabled ? <InspectionFindingsCard missionId={mission.id} findings={findings} /> : null}

      <div className="flex flex-col gap-2">
        <Button intent="secondary" leadingIcon={<Route />} disabled={!canGeneratePath} onClick={() => store.generatePath(mission.id)}>
          Generate Path
        </Button>
        <Button intent="primary" leadingIcon={<Play />} disabled={!canStart} onClick={() => store.startMission(mission.id)}>
          Start Mission
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button intent="secondary" leadingIcon={<Pause />} disabled={!canPause} onClick={() => store.pauseMission(mission.id)}>
            Pause
          </Button>
          <Button intent="secondary" leadingIcon={<Play />} disabled={!canResume} onClick={() => store.resumeMission(mission.id)}>
            Resume
          </Button>
        </div>
        <Button intent="destructive" leadingIcon={<X />} disabled={!canCancel} onClick={() => store.cancelMission(mission.id)}>
          Cancel
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button intent="outline" leadingIcon={<Copy />} onClick={() => store.duplicateMission(mission.id)}>
            Duplicate
          </Button>
          <Button intent="outline" leadingIcon={<Trash2 />} onClick={() => store.deleteMission(mission.id)}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Part 8's "when viewing a completed inspection
 * mission, provide access to findings/severity/location/resolution status/
 * summary" requirement. Reads live from the Finding Store (`findings` is
 * already scoped to this mission by the caller), so it updates in real time
 * as the mission's simulation tick detects more issues — not gated to only
 * "completed" missions, since that's strictly more informative and no less
 * honest than waiting until the end.
 */
function InspectionFindingsCard({ missionId, findings }: { missionId: string; findings: CropFinding[] }) {
  const summary = buildInspectionSummary(missionId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inspection Findings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {findings.length === 0 ? (
          <Typography variant="small" className="text-foreground-muted">
            No issues detected yet — findings appear here as the mission scans its target plot.
          </Typography>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <InspectorRow label="Total Detected" value={String(summary.totalDetected)} />
              <InspectorRow label="Resolved" value={String(summary.resolvedCount)} />
              <InspectorRow label="Unresolved" value={String(summary.unresolvedCount)} />
              <InspectorRow label="Needs Human Action" value={String(summary.requiresHumanActionCount)} />
            </div>
            <Divider />
            {findings.map((finding) => (
              <div key={finding.id} className="flex flex-col gap-0.5 rounded-lg border border-border-subtle bg-surface/60 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Typography variant="small" className="font-medium text-foreground">
                    {CROP_ISSUE_TYPE_LABELS[finding.issueType]}
                  </Typography>
                  <StatusBadge
                    status={finding.status === "resolved" ? "nominal" : finding.status === "requires-human-action" ? "attention" : "info"}
                    label={describeFindingStatus(finding)}
                  />
                </div>
                <Typography variant="caption" className="text-foreground-subtle">
                  {CROP_ISSUE_SEVERITY_LABELS[finding.severity]} severity · x={finding.position[0].toFixed(1)}, z={finding.position[1].toFixed(1)}
                </Typography>
                <Typography variant="caption" className="text-foreground-subtle">
                  {finding.correctiveActionDescription ?? finding.description}
                </Typography>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Typography variant="caption" className="text-foreground-subtle">
        {label}
      </Typography>
      <Typography variant="small" className="text-foreground">
        {value}
      </Typography>
    </div>
  );
}

function NumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Typography variant="caption" className="text-foreground-subtle">
        {label}
      </Typography>
      <Input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
      />
    </div>
  );
}
