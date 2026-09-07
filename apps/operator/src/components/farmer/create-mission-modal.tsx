"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Plus } from "lucide-react";

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Typography } from "@agrinexus/ui";

import { executeAction } from "@/lib/aura/actions/action-executor";
import { usePendingActionStore } from "@/lib/aura/actions/pending-action-store";
import { useHydrateAuraDataStores } from "@/lib/aura/hydrate-stores";
import type { MissionIntentKind } from "@/lib/aura/types";
import type { AppSessionUser } from "@/lib/auth/types";
import { FREE_DRONE_STATUSES, FREE_ROBOT_STATUSES } from "@/lib/autonomous/autonomous-behavior";
import { useFarmerTranslation } from "@/lib/farmer/i18n/use-farmer-translation";
import { useFleetStore } from "@/lib/fleet/fleet-store";
import { usePlotStore } from "@/lib/plots/plot-store";
import { useRobotStore } from "@/lib/robots/robot-store";

/**
 * A simple, non-technical manual mission-creation flow for
 * farmers who'd rather tap through a few screens than type a request.
 * Deliberately thin: every step here only COLLECTS the same
 * plot/intent/problem/vehicle-preference AURA's own natural-language path
 * already extracts, then hands off to the EXACT SAME `executeAction`
 * ("request-field-inspection" → "confirm-pending-action") the AURA chat
 * uses (one mission architecture, two front doors). No
 * separate mission-creation logic, no separate authorization, no separate
 * vehicle-selection rule exists here — this component owns UI state only.
 */

type WizardStep = "what" | "where" | "problem" | "vehicle" | "review" | "done";

const INTENT_OPTIONS: { intent: MissionIntentKind; label: string; needsProblem: boolean }[] = [
  { intent: "inspect", label: "Scan / Check", needsProblem: false },
  { intent: "patrol", label: "Patrol", needsProblem: false },
  { intent: "investigate", label: "Investigate Problem", needsProblem: true },
  { intent: "resolve", label: "Resolve Problem", needsProblem: true },
];

const PROBLEM_OPTIONS: { keyword: string; label: string }[] = [
  { keyword: "pest", label: "Pests / Insects" },
  { keyword: "weed", label: "Weeds" },
  { keyword: "fungal", label: "Fungal Issue" },
  { keyword: "standing water", label: "Standing Water" },
  { keyword: "dry", label: "Dry Soil / Irrigation" },
];

export function CreateMissionModal() {
  // Only the Dashboard's
  // visible TRIGGER button is translated (scope decision: this component's
  // internal multi-step wizard content is left English-only for this
  // milestone — see the milestone report's own Files Changed/Limitations
  // sections for why the "important buttons" requirement is read as the
  // Dashboard-visible button, not every string inside a deeper flow).
  const { t } = useFarmerTranslation();
  const { data: session } = useSession();
  const userRole = (session?.user as AppSessionUser | undefined)?.role ?? null;

  useHydrateAuraDataStores();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("what");
  const [intent, setIntent] = useState<MissionIntentKind | null>(null);
  const [plotId, setPlotId] = useState<string | null>(null);
  const [problemKeyword, setProblemKeyword] = useState<string | null>(null);
  const [proposalMessage, setProposalMessage] = useState<string | null>(null);
  const [proposalHasConfirm, setProposalHasConfirm] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const plots = Object.values(usePlotStore((state) => state.plots));
  const robots = Object.values(useRobotStore((state) => state.robots));
  const drones = Object.values(useFleetStore((state) => state.drones));
  const availableRobot = robots.find((robot) => FREE_ROBOT_STATUSES.includes(robot.status) && robot.activeMissionId === null);
  const availableDrone = drones.find((drone) => FREE_DRONE_STATUSES.includes(drone.status) && drone.activeMissionId === null);

  function reset() {
    setStep("what");
    setIntent(null);
    setPlotId(null);
    setProblemKeyword(null);
    setProposalMessage(null);
    setProposalHasConfirm(false);
    setResultMessage(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function goToReview(finalVehicleKind: "robot" | "drone" | undefined) {
    if (!intent || !plotId) return;
    setBusy(true);
    try {
      const result = await executeAction(
        {
          recognized: true,
          commandId: "request-field-inspection",
          label: "Create Mission",
          params: {
            requestedPlotId: plotId,
            missionIntent: intent,
            reportedProblemKeyword: problemKeyword ?? undefined,
            requestedVehicleKind: finalVehicleKind,
          },
        },
        userRole,
      );
      setProposalMessage(result.message);
      // Real state, not text-sniffing: a proposal actually left something
      // pending to confirm iff `usePendingActionStore` now holds it — the
      // exact same store AURA's own "Yes."/"Go ahead." confirmation reads.
      setProposalHasConfirm(usePendingActionStore.getState().pending !== null);
      setStep("review");
    } finally {
      setBusy(false);
    }
  }

  async function startMission() {
    setBusy(true);
    try {
      const result = await executeAction({ recognized: true, commandId: "confirm-pending-action", label: "Confirm Mission" }, userRole);
      setResultMessage(result.message);
      setStep("done");
    } finally {
      setBusy(false);
    }
  }

  const selectedIntentOption = INTENT_OPTIONS.find((option) => option.intent === intent);
  const selectedPlotLabel = plots.find((plot) => plot.id === plotId)?.label;

  return (
    <>
      <Button intent="outline" className="justify-start gap-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        {t("mission.createMission")}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          {step === "what" ? (
            <>
              <DialogHeader>
                <DialogTitle>What do you want to do?</DialogTitle>
                <DialogDescription>Choose what kind of mission to send.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 py-2">
                {INTENT_OPTIONS.map((option) => (
                  <Button
                    key={option.intent}
                    intent="outline"
                    onClick={() => {
                      setIntent(option.intent);
                      setStep("where");
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </>
          ) : null}

          {step === "where" ? (
            <>
              <DialogHeader>
                <DialogTitle>Where?</DialogTitle>
                <DialogDescription>Choose the field for this {selectedIntentOption?.label.toLowerCase()} mission.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 py-2">
                {plots.length === 0 ? (
                  <Typography variant="small" className="text-foreground-subtle">
                    No fields are configured on this farm yet.
                  </Typography>
                ) : (
                  plots.map((plot) => (
                    <Button
                      key={plot.id}
                      intent="outline"
                      onClick={() => {
                        setPlotId(plot.id);
                        setStep(selectedIntentOption?.needsProblem ? "problem" : "vehicle");
                      }}
                    >
                      {plot.label}
                    </Button>
                  ))
                )}
              </div>
              <DialogFooter>
                <Button intent="ghost" onClick={() => setStep("what")}>
                  Back
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {step === "problem" ? (
            <>
              <DialogHeader>
                <DialogTitle>What&apos;s the problem?</DialogTitle>
                <DialogDescription>Choose the issue to {intent === "resolve" ? "resolve" : "investigate"} in {selectedPlotLabel}.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 py-2">
                {PROBLEM_OPTIONS.map((option) => (
                  <Button
                    key={option.keyword}
                    intent="outline"
                    onClick={() => {
                      setProblemKeyword(option.keyword);
                      setStep("vehicle");
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <DialogFooter>
                <Button intent="ghost" onClick={() => setStep("where")}>
                  Back
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {step === "vehicle" ? (
            <>
              <DialogHeader>
                <DialogTitle>Vehicle</DialogTitle>
                <DialogDescription>Only vehicles that could actually be used are shown as valid choices — AURA still checks availability fresh either way.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2 py-2">
                <Button intent="outline" disabled={busy} onClick={() => void goToReview(undefined)}>
                  Automatic — Recommended
                </Button>
                {availableRobot ? (
                  <Button intent="outline" disabled={busy} onClick={() => void goToReview("robot")}>
                    {availableRobot.name} (Robot)
                  </Button>
                ) : null}
                {availableDrone ? (
                  <Button intent="outline" disabled={busy} onClick={() => void goToReview("drone")}>
                    {availableDrone.name} (Drone)
                  </Button>
                ) : null}
                {!availableRobot && !availableDrone ? (
                  <Typography variant="small" className="text-foreground-subtle">
                    No robot or drone is available right now — AURA will confirm this on the next step.
                  </Typography>
                ) : null}
              </div>
              <DialogFooter>
                <Button intent="ghost" onClick={() => setStep(selectedIntentOption?.needsProblem ? "problem" : "where")}>
                  Back
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {step === "review" ? (
            <>
              <DialogHeader>
                <DialogTitle>Review</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-1 py-2">
                <Typography variant="small">Mission: {selectedIntentOption?.label}</Typography>
                <Typography variant="small">Field: {selectedPlotLabel}</Typography>
                {problemKeyword ? <Typography variant="small">Problem: {PROBLEM_OPTIONS.find((option) => option.keyword === problemKeyword)?.label}</Typography> : null}
                <Typography variant="small" className="pt-2 text-foreground-muted">
                  {proposalMessage}
                </Typography>
              </div>
              <DialogFooter>
                <Button intent="outline" disabled={busy} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                {proposalHasConfirm ? (
                  <Button intent="primary" loading={busy} onClick={() => void startMission()}>
                    Start Mission
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}

          {step === "done" ? (
            <>
              <DialogHeader>
                <DialogTitle>{resultMessage?.toLowerCase().includes("underway") ? "Mission started" : "Mission update"}</DialogTitle>
              </DialogHeader>
              <Typography variant="small" className="py-2">
                {resultMessage}
              </Typography>
              <Typography variant="small" className="text-foreground-subtle">
                You can ask AURA about this mission any time — for example, &quot;How is it doing?&quot;
              </Typography>
              <DialogFooter>
                <Button intent="primary" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
