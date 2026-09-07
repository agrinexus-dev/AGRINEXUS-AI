import { CROP_ISSUE_SEVERITIES, CROP_ISSUE_TYPES, type CropIssueSeverity, type CropIssueType } from "./types";

/**
 * Deterministic candidate-issue generation — the ONLY place
 * `Math.random()`-style unpredictability is deliberately avoided. Every
 * candidate issue for a given (missionId, plotId) pair is 100% reproducible
 * — the same mission, re-simulated, always proposes the exact same
 * candidates in the exact same positions. Different missions (different
 * missionId) targeting the same plot get a DIFFERENT candidate set, so
 * "Mission A" and "Mission B" genuinely can (and usually do) detect
 * different issues, without ever making a single mission's own result
 * change on reload. Candidates are NEVER persisted — only the ones an
 * active mission's simulation tick actually detects become a real
 * `CropFinding` row (see `finding-store.ts`). This is deliberately the only
 * "issue" data structure in the app — there is no separate, parallel
 * "potential issues" table.
 */

export interface CropIssueCandidate {
  /** Stable within one mission's candidate set — `${missionId}-issue-${index}` — used as the finding's own id once detected, so a candidate can only ever produce ONE finding, no matter how many ticks come near it. */
  localId: string;
  issueType: CropIssueType;
  severity: CropIssueSeverity;
  /** Ground-plane (x, z), guaranteed inside the plot's real bounds (same margin `generateFlightPath`/`generateGroundRoute` already use). */
  position: [number, number];
  description: string;
}

// A small, believable number of issues per plot per mission ("Avoid
// absurd quantities... A plot should have a small believable number of
// issues") — never more than this many candidates exist for one mission's
// run, regardless of plot size.
const MIN_ISSUES_PER_MISSION = 1;
const MAX_ISSUES_PER_MISSION = 4;

// Meters a drone/robot must come within an issue's position to "detect" it
// — generous enough that the existing full-coverage lawnmower pattern
// (see mission-defaults.ts/robot-mission-defaults.ts's own "constructed to
// sweep the whole inset plot rectangle" comment) reliably passes within
// range of every candidate, without being so large that a mission "detects"
// issues nowhere near its actual flight/drive line. Assumed simulation
// constants, documented as such — same "plausible, not a fabricated real
// sensor spec" rule `ASSUMED_FOOTPRINT_WIDTH_M` already establishes.
export const DRONE_SCAN_RADIUS_M = 6;
export const ROBOT_SCAN_RADIUS_M = 4;

/** mulberry32 — a tiny, seedable PRNG (public-domain algorithm). Deterministic: the same numeric seed always produces the same sequence, which is exactly what Part 3 requires and `Math.random()` cannot provide. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A simple, stable string hash (djb2) — turns `missionId:plotId` into a numeric seed for `mulberry32`. Not cryptographic; only needs to be stable and well-distributed across mission/plot id strings. */
function hashSeed(text: string): number {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return hash >>> 0;
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length) % items.length]!;
}

/** Biases toward low/medium — a plot realistically has more minor issues than critical ones. Weighted by simple repetition, not a fabricated statistical model. */
const SEVERITY_WEIGHTS: CropIssueSeverity[] = ["low", "low", "medium", "medium", "medium", "high", "high", "critical"];

function describeIssue(issueType: CropIssueType, severity: CropIssueSeverity, plotLabel: string): string {
  const severityWord = severity === "critical" ? "Critical" : severity[0]!.toUpperCase() + severity.slice(1);
  const byType: Record<CropIssueType, string> = {
    "dry-soil": `${severityWord} dry soil patch detected in ${plotLabel}.`,
    "nutrient-deficiency": `${severityWord} signs of nutrient deficiency observed in ${plotLabel}.`,
    "weed-growth": `${severityWord} weed growth detected in ${plotLabel}.`,
    "pest-activity": `${severityWord} pest activity detected in ${plotLabel}.`,
    "fungal-risk": `${severityWord} fungal risk indicators observed in ${plotLabel}.`,
    "standing-water": `${severityWord} standing water detected in ${plotLabel}.`,
    "crop-stress": `${severityWord} crop stress observed in ${plotLabel}.`,
    "damaged-crop-area": `${severityWord} crop damage detected in ${plotLabel}.`,
  };
  return byType[issueType];
}

/**
 * Generates this mission's deterministic candidate issue set for one plot —
 * pure function, no store reads, no randomness beyond the seeded PRNG.
 * `plotCenter`/`plotSize` come straight from the real Plot Store (never the
 * static `farmPlots` array's own copy read directly by a caller — see
 * `mission-defaults.ts`/`robot-mission-defaults.ts`, which already resolve
 * the plot before calling this).
 *
 * `allowedIssueTypes` — three-way, deliberately NOT just
 * "empty means unrestricted":
 *  - `undefined` (omitted) — no restriction, the full `CROP_ISSUE_TYPES`
 *  list. Unchanged behavior for drone missions, which only ever detect/
 *  report — see `lib/missions/use-mission-simulation.ts`'s own
 *  `scanForIssues`, which never passes this argument at all.
 *  - a non-empty array — restricted to exactly those types.
 *  - an EXPLICIT empty array — restricted to NOTHING (returns no
 *  candidates). `use-robot-mission-simulation.ts` passes the calling
 *  robot mission type's real supported issue set (`supportedIssueTypesFor`,
 *  `lib/robot-missions/robot-mission-capabilities.ts`), which is
 *  genuinely `[]` for a raw, uncurated mission type (e.g.
 *  "manual-drive") — that must mean "this mission type generates
 *  nothing," never silently fall back to the full unrestricted list.
 * Together this is what makes a robot mission's candidate set "constrained
 * by ROBOT CAPABILITIES, not merely the global CropIssueType list" (Part
 * 8's own wording) — the candidate generator itself can never produce an
 * issue the calling robot mission type has no simulated solution for,
 * rather than generating the full set and merely ignoring/hiding the
 * unsupported ones after the fact.
 */
export function generatePlotIssueCandidates(
  missionId: string,
  plotId: string,
  plotLabel: string,
  plotCenter: [number, number],
  plotSize: [number, number],
  allowedIssueTypes?: readonly CropIssueType[],
): CropIssueCandidate[] {
  if (allowedIssueTypes && allowedIssueTypes.length === 0) return [];

  const random = mulberry32(hashSeed(`${missionId}:${plotId}`));
  const count = MIN_ISSUES_PER_MISSION + Math.floor(random() * (MAX_ISSUES_PER_MISSION - MIN_ISSUES_PER_MISSION + 1));
  const issuePool = allowedIssueTypes ?? CROP_ISSUE_TYPES;

  const [cx, cz] = plotCenter;
  const [width, depth] = plotSize;
  const margin = 2; // keeps issues off the very edge of the plot, same spirit as generateFlightPath's own inset margin
  const halfWidth = Math.max(0.5, width / 2 - margin);
  const halfDepth = Math.max(0.5, depth / 2 - margin);

  const candidates: CropIssueCandidate[] = [];
  for (let index = 0; index < count; index += 1) {
    const issueType = pick(random, issuePool);
    const severity = pick(random, SEVERITY_WEIGHTS);
    const x = cx + (random() * 2 - 1) * halfWidth;
    const z = cz + (random() * 2 - 1) * halfDepth;

    candidates.push({
      localId: `${missionId}-issue-${index}`,
      issueType,
      severity,
      position: [Math.round(x * 100) / 100, Math.round(z * 100) / 100],
      description: describeIssue(issueType, severity, plotLabel),
    });
  }

  return candidates;
}

/** Straight-line ground-plane distance — same metric every route/telemetry calculation in this app already uses (`Math.hypot`). */
export function withinScanRadius(vehiclePosition: [number, number], issuePosition: [number, number], radiusMeters: number): boolean {
  return Math.hypot(vehiclePosition[0] - issuePosition[0], vehiclePosition[1] - issuePosition[1]) <= radiusMeters;
}

/** `CROP_ISSUE_SEVERITIES`/`CROP_ISSUE_TYPES` re-exported for callers that only need the generator, not the wider types module. */
export { CROP_ISSUE_SEVERITIES, CROP_ISSUE_TYPES };
