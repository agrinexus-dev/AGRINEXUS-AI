/**
 * Shared Crop Finding types. A "finding" is a
 * SIMULATED agricultural-issue detection made by a drone or robot mission
 * while surveying/working over its target plot — see `issue-generator.ts`
 * for how candidate issues are generated (deterministically, never
 * persisted until detected) and `finding-store.ts` for the single source of
 * truth every consumer (Mission Inspectors, the Digital Twin, AURA) reads
 * from.
 */

export type CropIssueType =
  | "dry-soil"
  | "nutrient-deficiency"
  | "weed-growth"
  | "pest-activity"
  | "fungal-risk"
  | "standing-water"
  | "crop-stress"
  | "damaged-crop-area";

export const CROP_ISSUE_TYPES: CropIssueType[] = [
  "dry-soil",
  "nutrient-deficiency",
  "weed-growth",
  "pest-activity",
  "fungal-risk",
  "standing-water",
  "crop-stress",
  "damaged-crop-area",
];

export const CROP_ISSUE_TYPE_LABELS: Record<CropIssueType, string> = {
  "dry-soil": "Dry Soil",
  "nutrient-deficiency": "Nutrient Deficiency",
  "weed-growth": "Weed Growth",
  "pest-activity": "Pest Activity",
  "fungal-risk": "Fungal Risk",
  "standing-water": "Standing Water",
  "crop-stress": "Crop Stress",
  "damaged-crop-area": "Damaged Crop Area",
};

export type CropIssueSeverity = "low" | "medium" | "high" | "critical";

export const CROP_ISSUE_SEVERITIES: CropIssueSeverity[] = ["low", "medium", "high", "critical"];

export const CROP_ISSUE_SEVERITY_LABELS: Record<CropIssueSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/**
 * Only 3 real persisted states. "Action Available" and "Action Performed" —
 * two more terms Part 6 asks the UI/report to distinguish — are DERIVED at
 * render time (see `describeFindingStatus` below) from `status` + whether
 * `issueType` has a robot capability + whether `correctiveActionType` is
 * set, rather than persisting two more states that would always be
 * redundant with those already-persisted fields.
 */
export type CropFindingStatus = "detected" | "resolved" | "requires-human-action";

export type CropFindingDetectionMethod = "drone" | "robot";

export interface CropFinding {
  id: string;
  plotId: string;
  plotLabel: string;
  issueType: CropIssueType;
  severity: CropIssueSeverity;
  /** Ground-plane (x, z) in the Digital Twin's existing scene coordinate system — always falls inside the plot's real bounds. */
  position: [number, number];
  description: string;
  status: CropFindingStatus;

  detectionMethod: CropFindingDetectionMethod;
  /** Exactly one of these two is non-null, matching `detectionMethod`. */
  detectedByDroneMissionId: string | null;
  detectedByRobotMissionId: string | null;
  /** Whichever mission detected this finding's own label, snapshotted at detection time — lets the UI show "Detected by: Plot A Survey" without a join. */
  detectedByMissionName: string;

  /** Non-null only when a robot mission actually performed the simulated corrective action — never set merely because an issue was detected. */
  correctiveActionType: string | null;
  correctiveActionDescription: string | null;
  resolvedByRobotMissionId: string | null;

  detectedAt: number;
  resolvedAt: number | null;
}

/**
 * The robot capability map — the ONLY place that decides whether a
 * detected issue can receive a simulated corrective action. An issue type
 * absent from this map (or mapped to `null`) can NEVER be resolved by a
 * robot, regardless of which mission/robot detected it — the app must never
 * claim a robot fixed something it wasn't designed to fix.
 */
export interface RobotCapability {
  actionType: string;
  /** Shown in the finding's report line, e.g. "Simulated weed removal pass completed." */
  describeAction: (issue: { plotLabel: string }) => string;
}

export const ROBOT_ISSUE_CAPABILITIES: Partial<Record<CropIssueType, RobotCapability>> = {
  "weed-growth": {
    actionType: "simulated-weed-removal",
    describeAction: (issue) => `Simulated weed removal pass completed on ${issue.plotLabel}.`,
  },
  "standing-water": {
    actionType: "simulated-drainage-check",
    describeAction: (issue) => `Simulated drainage check performed on ${issue.plotLabel} — flow path cleared.`,
  },
  "pest-activity": {
    actionType: "simulated-localized-treatment",
    describeAction: (issue) => `Simulated localized pest treatment applied on ${issue.plotLabel}.`,
  },
  // Two more capabilities the phase explicitly asks for,
  // each backed by a real simulated actuator action (never just a status
  // flip): a ground robot plausibly carries a sprayer (fungicide) and can
  // trigger a zone irrigation valve, so these are legitimate additions to
  // the SAME map, not a new mechanism.
  "fungal-risk": {
    actionType: "simulated-fungicide-treatment",
    describeAction: (issue) => `Simulated fungicide treatment applied on ${issue.plotLabel} — fungal risk addressed.`,
  },
  "dry-soil": {
    actionType: "simulated-irrigation-cycle",
    describeAction: (issue) => `Simulated irrigation cycle triggered on ${issue.plotLabel} — soil moisture restored.`,
  },
  // nutrient-deficiency, crop-stress, and damaged-crop-area remain
  // deliberately absent — no simulated actuator (fertilizer applicator,
  // climate control, structural repair) exists for any of them in this app,
  // so a robot can only ever detect/report these, never resolve them. Never
  // add an entry here without a real simulated capability backing it
  // (Architectural Rule 2: never claim a repair that didn't happen).
};

export function isRobotCapableIssue(issueType: CropIssueType): boolean {
  return issueType in ROBOT_ISSUE_CAPABILITIES;
}

/** The full 5-term vocabulary Part 6 asks the UI/report to distinguish, derived from the 3 persisted states above — never a 4th/5th persisted status. */
export type FindingDisplayStatus = "Detected" | "Action Available" | "Action Performed & Resolved" | "Resolved" | "Requires Human Action";

export function describeFindingStatus(finding: Pick<CropFinding, "status" | "issueType" | "correctiveActionType">): FindingDisplayStatus {
  if (finding.status === "requires-human-action") return "Requires Human Action";
  if (finding.status === "resolved") return finding.correctiveActionType ? "Action Performed & Resolved" : "Resolved";
  // status === "detected"
  return isRobotCapableIssue(finding.issueType) ? "Action Available" : "Detected";
}

/** A farm-wide or per-mission rollup (Part 7 "mission result contains inspection summary") — always computed fresh from real findings, never cached/fabricated. See `finding-store.ts`'s `buildInspectionSummary`. */
export interface InspectionSummary {
  totalDetected: number;
  bySeverity: Record<CropIssueSeverity, number>;
  byType: Partial<Record<CropIssueType, number>>;
  resolvedCount: number;
  unresolvedCount: number;
  requiresHumanActionCount: number;
  /** Plain-language lines for issues a human should follow up on — never a fabricated recommendation, always traced to a real finding. */
  recommendedHumanActions: string[];
}
