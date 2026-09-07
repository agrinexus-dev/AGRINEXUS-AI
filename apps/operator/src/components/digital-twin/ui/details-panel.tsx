"use client";

import { useEffect, useState, type RefObject } from "react";
import { Bot, Boxes, Flag, PlaneTakeoff, Radio, Route, Sparkles, Sprout } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button, Panel, StatusBadge, Typography } from "@agrinexus/ui";

import { useAuraChatStore } from "@/lib/aura/client/aura-chat-store";
import { useCollectAuraContext } from "@/lib/aura/context/collect-context";
import { useFleetStore } from "@/lib/fleet/fleet-store";
import { DRONE_STATUS_LABELS } from "@/lib/fleet/types";
import { useFindingStore } from "@/lib/findings/finding-store";
import { CROP_ISSUE_TYPE_LABELS, describeFindingStatus, isRobotCapableIssue } from "@/lib/findings/types";
import { useRobotStore } from "@/lib/robots/robot-store";
import { ROBOT_STATUS_LABELS } from "@/lib/robots/types";
import { getPlotRecommendation } from "@/lib/sensor-analytics/mission-integration";
import { useSensorStore } from "@/lib/sensors/sensor-store";
import { formatSensorReading, SENSOR_STATUS_LABELS } from "@/lib/sensors/types";

import type { AutonomousUnitHandle, AutonomousUnitStatus } from "../scene/systems/types";
import type { SelectableEntity } from "../types";

export interface DetailsPanelProps {
  selected: SelectableEntity | null;
  /** Every fleet drone's live handle, keyed by id — looked up by `selected.id` rather than assuming a single drone. */
  droneRefs: RefObject<Map<string, AutonomousUnitHandle>>;
  /** Every fleet robot's live handle, keyed by id — mirrors `droneRefs`, replacing the old single `robotRef`. */
  robotRefs: RefObject<Map<string, AutonomousUnitHandle>>;
}

const TYPE_ICON = {
  field: Sprout,
  building: Boxes,
  road: Route,
  drone: PlaneTakeoff,
  robot: Bot,
  sensor: Radio,
  finding: Flag,
};

const TYPE_LABEL = {
  field: "Field",
  building: "Building",
  road: "Road",
  drone: "Drone",
  robot: "Robot",
  sensor: "Sensor",
  finding: "Inspection Finding",
};

const POLL_INTERVAL_MS = 300;

/**
 * Shows static placeholder info for the current selection; falls back to the
 * empty state when nothing is selected. Drone/Robot selections additionally
 * poll their unit's `getStatus()` at a throttled interval — the animation
 * loop that drives their movement never touches React state directly (see
 * `scene/systems/drone.tsx`/`robot.tsx`), this panel is the only place that
 * turns live 3D state into a (slow, deliberate) React re-render.
 */
export function DetailsPanel({ selected, droneRefs, robotRefs }: DetailsPanelProps) {
  const [liveStatus, setLiveStatus] = useState<AutonomousUnitStatus | null>(null);
  const isUnit = selected?.type === "drone" || selected?.type === "robot";
  // `handle.getStatus().status` is a fixed "Patrolling" string baked into
  // `scene/systems/drone.tsx` (intentionally not modified) — it doesn't
  // know about mission diversion. The Fleet Store's own
  // `status` field does (see `setDroneActiveRoute`), so drones read their
  // displayed status from there instead.
  const fleetDroneStatus = useFleetStore((state) => (selected?.type === "drone" ? (state.drones[selected.id]?.status ?? null) : null));
  // Robots don't have this staleness problem — `robot.tsx`'s `getStatus()`
  // already reads `config.status` live — but reading the
  // Robot Store directly here too keeps both unit types on the exact same
  // "status is a store fact, not a 3D-object fact" rule for consistency.
  const fleetRobotStatus = useRobotStore((state) => (selected?.type === "robot" ? (state.robots[selected.id]?.status ?? null) : null));
  // Sensors are stationary and have no `AutonomousUnitHandle` at all (no
  // `getObject`/`getStatus` — nothing to poll), so they skip the handle-poll
  // effect below entirely and read straight from the Sensor Store instead
  // the same "status is a store fact" rule the drone/robot
  // overrides above already follow, just without a handle in the mix.
  const selectedSensor = useSensorStore((state) => (selected?.type === "sensor" ? (state.sensors[selected.id] ?? null) : null));
  // Findings are stationary too (a detected issue
  // doesn't move), same "read straight from the store, no handle" rule
  // `selectedSensor` above already follows.
  const selectedFinding = useFindingStore((state) => (selected?.type === "finding" ? (state.findings[selected.id] ?? null) : null));

  // "Ask AURA about this". Route-aware because AURA is presented
  // differently in each section: Operator has a floating panel this can open and send
  // into directly; Farmer's AURA is its own full page
  // (`app/farmer/aura/page.tsx`), so this navigates there instead and lets
  // that page send the starter question once it mounts (see its own
  // `?ask=1` handling) — the selection itself survives the navigation
  // unchanged, since it lives in the global `useLiveContextStore`, not
  // component state.
  const pathname = usePathname();
  const router = useRouter();
  const openAuraChat = useAuraChatStore((state) => state.open);
  const sendAuraMessage = useAuraChatStore((state) => state.sendMessage);
  const collectAuraContext = useCollectAuraContext();
  const isFarmerSection = pathname?.startsWith("/farmer") ?? false;

  function handleAskAuraAboutFinding() {
    if (isFarmerSection) {
      router.push("/farmer/aura?ask=1");
      return;
    }
    openAuraChat();
    void sendAuraMessage("What's wrong with this issue, and can it be handled automatically?", collectAuraContext());
  }

  useEffect(() => {
    if (!selected || !isUnit) {
      setLiveStatus(null);
      return;
    }

    function poll() {
      if (!selected) return;
      const handle = selected.type === "drone" ? droneRefs.current.get(selected.id) : robotRefs.current.get(selected.id);
      setLiveStatus(handle?.getStatus() ?? null);
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [selected, isUnit, droneRefs, robotRefs]);

  // A snapshot read ("Digital Twin" integration), computed once
  // per render off the CURRENT `selected` field — refreshes whenever the
  // selection changes, mirroring how this panel already shows fresh sensor
  // data on every render without a dedicated poll loop. Deliberately no new
  // interval/subscription here ("do not add unnecessary polling
  // loops") — a field's recommendation isn't as time-critical as a moving
  // unit's live telemetry.
  const plotRecommendation = selected?.type === "field" ? getPlotRecommendation(selected.id) : null;

  if (!selected) {
    return null;
  }

  const Icon = TYPE_ICON[selected.type];

  return (
    <Panel variant="glass" padding="sm" className="flex w-64 flex-col gap-3 shadow-elevated">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-foreground-muted" aria-hidden />
        <Typography variant="caption">{TYPE_LABEL[selected.type]}</Typography>
      </div>

      <div className="flex flex-col gap-1">
        <Typography variant="h4">{selected.label}</Typography>
        <Typography variant="small" className="text-foreground-muted">
          {selected.meta}
        </Typography>
      </div>

      {isUnit && liveStatus ? (
        <div className="flex flex-col gap-1.5">
          <DetailRow label="Battery" value={`${liveStatus.batteryPercent}%`} />
          {liveStatus.speedMps !== undefined ? <DetailRow label="Speed" value={`${liveStatus.speedMps.toFixed(1)} m/s`} /> : null}
          <DetailRow
            label="Status"
            value={
              fleetDroneStatus
                ? DRONE_STATUS_LABELS[fleetDroneStatus]
                : fleetRobotStatus
                  ? ROBOT_STATUS_LABELS[fleetRobotStatus]
                  : liveStatus.status
            }
          />
          <DetailRow label={selected.type === "drone" ? "Current Waypoint" : "Current Destination"} value={liveStatus.currentLabel} />
        </div>
      ) : null}

      {selectedSensor ? (
        <div className="flex flex-col gap-1.5">
          <DetailRow label="Reading" value={formatSensorReading(selectedSensor)} />
          <DetailRow label="Battery" value={`${selectedSensor.batteryPercent}%`} />
          <DetailRow label="Signal" value={`${selectedSensor.signalPercent}%`} />
          <DetailRow label="Status" value={SENSOR_STATUS_LABELS[selectedSensor.status]} />
        </div>
      ) : null}

      {selectedFinding ? (
        <div className="flex flex-col gap-1.5">
          <DetailRow label="Issue" value={CROP_ISSUE_TYPE_LABELS[selectedFinding.issueType]} />
          <DetailRow label="Plot" value={selectedFinding.plotLabel} />
          <DetailRow label="Severity" value={selectedFinding.severity[0]!.toUpperCase() + selectedFinding.severity.slice(1)} />
          <DetailRow label="Status" value={describeFindingStatus(selectedFinding)} />
          <DetailRow label="Detected by" value={selectedFinding.detectedByMissionName} />
          <DetailRow label="Detected at" value={formatFindingTimestamp(selectedFinding.detectedAt)} />
          <DetailRow label="Coordinates" value={`x=${selectedFinding.position[0].toFixed(1)}, z=${selectedFinding.position[1].toFixed(1)}`} />
          {selectedFinding.status !== "resolved" ? (
            <DetailRow
              label="Autonomous action"
              value={isRobotCapableIssue(selectedFinding.issueType) ? "Available — a robot can handle this" : "Not available — needs human inspection"}
            />
          ) : null}
          {selectedFinding.correctiveActionDescription ? <DetailRow label="Action" value={selectedFinding.correctiveActionDescription} /> : null}
          {selectedFinding.resolvedAt ? <DetailRow label="Resolved at" value={formatFindingTimestamp(selectedFinding.resolvedAt)} /> : null}
          <Button intent="secondary" size="sm" className="mt-1 w-full justify-center gap-1.5" onClick={handleAskAuraAboutFinding}>
            <Sparkles className="size-3.5" aria-hidden />
            Ask AURA about this
          </Button>
          <Typography variant="caption" className="text-foreground-subtle">
            {selectedFinding.description}
          </Typography>
        </div>
      ) : null}

      {plotRecommendation ? (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2">
          <Typography variant="caption" className="text-foreground-subtle">
            Agricultural Reasoning
          </Typography>
          <DetailRow label="Recommendation" value={plotRecommendation.action === "unavailable" ? "Unavailable" : plotRecommendation.action[0]!.toUpperCase() + plotRecommendation.action.slice(1)} />
          {plotRecommendation.confidence ? <DetailRow label="Confidence" value={plotRecommendation.confidence[0]!.toUpperCase() + plotRecommendation.confidence.slice(1)} /> : null}
          <Typography variant="caption" className="text-foreground-subtle">
            {plotRecommendation.reason}
          </Typography>
        </div>
      ) : null}

      <StatusBadge status="nominal" label="Placeholder data" />
    </Panel>
  );
}

// Same relative-time-then-date convention already
// established independently in `collect-context.ts` (AURA) and
// `alerts-page.tsx`; this file didn't have its own finding timestamp yet.
function formatFindingTimestamp(ms: number): string {
  const diffMinutes = Math.round((Date.now() - ms) / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  return new Date(ms).toLocaleDateString();
}

function DetailRow({ label, value }: { label: string; value: string }) {
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
