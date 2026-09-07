import { CROP_ISSUE_TYPE_LABELS, ROBOT_ISSUE_CAPABILITIES, type CropIssueType } from "@/lib/findings/types";

import type { RobotMissionType } from "./types";

/**
 * A clean, human-readable label for the real simulated
 * action `ROBOT_ISSUE_CAPABILITIES` performs for each issue type (built
 * FROM those real `actionType` strings, never invented independently of
 * them). Two issue types intentionally share a label ("Simulated
 * Treatment" for both pest-activity and fungal-risk) — that's an honest
 * reflection of "Pest & Fungal Treatment" performing one kind of action
 * across both supported issues, not a coincidence to hide.
 */
const ROBOT_ACTION_LABELS: Partial<Record<CropIssueType, string>> = {
  "weed-growth": "Automated Weed Removal",
  "standing-water": "Drainage",
  "pest-activity": "Simulated Treatment",
  "fungal-risk": "Simulated Treatment",
  "dry-soil": "Irrigation",
};

function actionLabelsFor(issueTypes: CropIssueType[]): string[] {
  const labels = issueTypes.map((type) => ROBOT_ACTION_LABELS[type]).filter((label): label is string => Boolean(label));
  return [...new Set(labels)];
}

function detectLabelsFor(issueTypes: CropIssueType[]): string[] {
  return issueTypes.map((type) => CROP_ISSUE_TYPE_LABELS[type]);
}

/**
 * The ONE canonical place that answers "which crop
 * issues can THIS robot mission type actually find and fix?" Every other
 * place that needs a curated, honestly-labeled robot mission type list
 * (the Recurring Missions panel, the one-time Create Robot Mission dialog,
 * the robot mission simulation's issue generation) reads from here instead
 * of keeping its own copy — this replaces `recurring-missions-panel.tsx`'s
 * own local `ROBOT_RECURRING_TYPES` array, which duplicated
 * exactly this information.
 *
 * `supportedIssueTypes` is always a subset of `ROBOT_ISSUE_CAPABILITIES`'s
 * keys (`lib/findings/types.ts`) — the architecture Part 6/8 asks for is
 * ISSUE TYPE → ROBOT CAPABILITY → MISSION TYPE → RESOLUTION, so a mission
 * type can never claim to support an issue type the robot has no real
 * simulated capability for. `use-robot-mission-simulation.ts` passes this
 * exact set into `generatePlotIssueCandidates`'s `allowedIssueTypes`, so a
 * robot mission of this type can never even GENERATE an issue outside it
 *  — it isn't a filter applied after the fact.
 */
export interface RobotMissionCapability {
  type: RobotMissionType;
  label: string;
  description: string;
  /** The issue types this mission type's simulated scan is restricted to — always resolvable, by construction (see this file's own doc comment). */
  supportedIssueTypes: CropIssueType[];
  /** The concrete detect → navigate → act → resolve steps shown in the UI (Part 7's own example format) — built from the real `ROBOT_ISSUE_CAPABILITIES` action descriptions, never invented text. */
  solutionSteps: string[];
  /**
   * The explicit "Detects / Can Resolve / Robot Action"
   * breakdown the operator should see BEFORE launching a mission, so the
   * UI doesn't rely on the operator reading a single flowing sentence to
   * understand what a mission type actually does. `detects` and
   * `canResolve` are the SAME list today (`supportedIssueTypes` mapped to
   * display labels) — kept as two separate fields/headings rather than
   * merged into one, both because that's what Part E's example format
   * asks for and because the architecture doesn't structurally guarantee
   * they'll always coincide (a future issue type could be detectable but
   * not yet resolvable) even though every current entry happens to.
   */
  detects: string[];
  canResolve: string[];
  /** Human-readable action label(s) — e.g. "Automated Weed Removal", "Irrigation" — derived from `ROBOT_ISSUE_CAPABILITIES`'s real `actionType`s, never invented independently of them. */
  robotActions: string[];
}

function stepsFor(label: string, issueTypes: CropIssueType[]): string[] {
  const actionWords = issueTypes
    .map((type) => ROBOT_ISSUE_CAPABILITIES[type]?.actionType.replace("simulated-", "").replaceAll("-", " "))
    .filter((word): word is string => Boolean(word));
  return [
    `Detect ${label.toLowerCase()}`,
    "Navigate to the detected location",
    `Perform simulated ${actionWords.join(" / ") || "corrective action"}`,
    "Mark the finding resolved",
  ];
}

type CapabilityDraft = Omit<RobotMissionCapability, "detects" | "canResolve" | "robotActions">;

const CAPABILITY_DRAFTS: CapabilityDraft[] = [
  {
    type: "crop-inspection",
    label: "Crop Inspection",
    description: "General inspection pass — detects any issue this robot is equipped to resolve, and resolves it.",
    supportedIssueTypes: ["dry-soil", "weed-growth", "pest-activity", "fungal-risk", "standing-water"],
    solutionSteps: stepsFor("a supported crop issue", ["dry-soil", "weed-growth", "pest-activity", "fungal-risk", "standing-water"]),
  },
  {
    type: "weed-detection",
    label: "Weed Detection & Removal",
    description: "Detects weed growth and performs simulated removal.",
    supportedIssueTypes: ["weed-growth"],
    solutionSteps: stepsFor("weed growth", ["weed-growth"]),
  },
  {
    type: "targeted-spraying",
    label: "Pest & Fungal Treatment",
    description: "Detects pest activity and fungal risk, and performs simulated treatment.",
    supportedIssueTypes: ["pest-activity", "fungal-risk"],
    solutionSteps: stepsFor("pest activity or fungal risk", ["pest-activity", "fungal-risk"]),
  },
  {
    type: "soil-sampling",
    label: "Soil & Irrigation Inspection",
    description: "Detects dry soil and standing water, and performs simulated irrigation/drainage action.",
    supportedIssueTypes: ["dry-soil", "standing-water"],
    solutionSteps: stepsFor("dry soil or standing water", ["dry-soil", "standing-water"]),
  },
];

/**
 * `detects`/`canResolve`/`robotActions` are derived here, once, from each
 * draft's own `supportedIssueTypes` — rather than hand-transcribed per
 * entry above — so the "Detects" list, the "Can Resolve" list, and the
 * curated type's actual generation/resolution behavior can never drift
 * apart from each other.
 */
export const ROBOT_MISSION_CAPABILITIES: RobotMissionCapability[] = CAPABILITY_DRAFTS.map((draft) => ({
  ...draft,
  detects: detectLabelsFor(draft.supportedIssueTypes),
  canResolve: detectLabelsFor(draft.supportedIssueTypes),
  robotActions: actionLabelsFor(draft.supportedIssueTypes),
}));

export function getRobotMissionCapability(type: RobotMissionType): RobotMissionCapability | undefined {
  return ROBOT_MISSION_CAPABILITIES.find((entry) => entry.type === type);
}

/** The issue types a robot mission of this type may generate/detect — empty for any raw `RobotMissionType` outside the curated list above (e.g. "manual-drive"), meaning "generates nothing" rather than falling back to the full, unconstrained list. */
export function supportedIssueTypesFor(type: RobotMissionType): CropIssueType[] {
  return getRobotMissionCapability(type)?.supportedIssueTypes ?? [];
}

/**
 * "deterministic capability-driven
 * logic", never an AI guess: given one already-detected issue type, returns
 * the MOST SPECIFIC `RobotMissionType` that can resolve it (the fewest
 * `supportedIssueTypes`, so "weed-detection" wins over the 5-issue-wide
 * "crop-inspection" for a weed-growth finding), falling back to
 * "crop-inspection" only when no narrower type covers it. `null` only for an
 * issue type with no robot capability at all (`ROBOT_ISSUE_CAPABILITIES` —
 * Part 8's human-required issues), which the caller must treat as "cannot be
 * assigned to an autonomous robot", never silently widened to
 * "crop-inspection" anyway.
 */
export function resolveRobotMissionTypeForIssue(issueType: CropIssueType): RobotMissionType | null {
  if (!(issueType in ROBOT_ISSUE_CAPABILITIES)) return null;

  const candidates = ROBOT_MISSION_CAPABILITIES.filter((capability) => capability.supportedIssueTypes.includes(issueType));
  if (candidates.length === 0) return null;

  const mostSpecific = candidates.reduce((best, candidate) =>
    candidate.supportedIssueTypes.length < best.supportedIssueTypes.length ? candidate : best,
  );
  return mostSpecific.type;
}
