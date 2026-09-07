import type { AuraContext } from "../types";

/**
 * AURA Smart Context & Token
 * Optimization — the deterministic, auditable "which context domains does
 * this specific question actually need" layer Part 3 asks for. Mirrors
 * `routing/task-router.ts`'s own established philosophy exactly: plain
 * regex/keyword classification, never an LLM call, so a misclassification
 * has a bounded, predictable blast radius (an omitted section, never a
 * wrong EXECUTION path — this file never touches the action/permission
 * system at all).
 *
 * SAFE-DEFAULT PRINCIPLE (the one rule every other decision in this file
 * defers to): a message this classifier doesn't clearly recognize as
 * SPECIFICALLY about one domain falls back to including EVERYTHING — the
 * exact behavior AURA already had before this change. This is what makes an
 * unrecognized phrasing (including, honestly, anything in a language this
 * English-keyword classifier doesn't understand yet — e.g. Urdu, see the
 * The earlier Section Z) safe rather than silently under-informed:
 * failing OPEN (more context) is always preferred over failing CLOSED
 * (less context), because losing farm grounding is a correctness/safety
 * regression and losing a few hundred tokens on an ambiguous message is not.
 */

export interface ContextNeeds {
  fleet: boolean;
  missions: boolean;
  findings: boolean;
  weather: boolean;
  sensors: boolean;
  analytics: boolean;
  recurring: boolean;
  plotRecommendations: boolean;
  /**
   * A real plot this message named, resolved against THIS farm's actual
   * `AuraContext.plots` — never invented, never assumed from a generic
   * A–D letter pattern (a real farm's plot labels are whatever that farm
   * actually named them). `null` when no specific field was named, or when
   * a named field didn't match any real plot (in which case the Plots
   * list — always included, see `prompt-builder.ts` — still lets AURA
   * honestly say no such plot exists, per Part 8).
   */
  targetPlotLabel: string | null;
  /**
   * AURA Context Intelligence & Provider
 * Utilization — mirrors `targetPlotLabel` exactly, one level
   * down: a specific REAL drone or robot this message named, resolved
   * against THIS farm's actual `AuraContext.drones`/`.robots` (never
   * invented, never assumed from a generic "Drone 1" pattern). `null` when
   * no specific vehicle was named, or when a named one didn't match any
   * real vehicle (in which case the full fleet list still lets AURA
   * honestly say no such drone/robot exists — same "never silently show
   * nothing" rule `targetPlotLabel` already establishes). `fleet` itself
   * still stays a whole-domain boolean (Part 3: reuse `context-selector.ts`
   * as the ONE shared resolver, don't invent a second axis of the same
   * information) — this only tells `prompt-builder.ts` which ONE entry
   * within that domain to render when the domain IS included, per Part 7's
   * "retrieve the relevant entity rather than the entire collection where
   * possible."
   */
  targetEntityName: string | null;
  /**
   * Whether this message needs the
   * static agricultural-knowledge reference block (`prompt-builder.ts`'s
   * `KNOWLEDGE_REFERENCE`, ~1,000 tokens of general crop/disease/pest
   * definitions) — the ONE piece of the system prompt's STABLE half this
   * phase found safe to make conditional (everything else in that half is
   * a behavioral/safety/formatting rule the Part 15
   * explicitly preserves, not "context" in the farm-data sense Part 5's
   * domain model is about). `true` by the same safe-default-favors-
   * inclusion rule every other field here follows: a CONFIDENTLY farm-
   * specific request (a real domain matched, e.g. "drone battery",
   * "weather today") sets this `false` — general crop-disease definitions
   * aren't what a fleet-status or weather question needs — while the pure
   * general-knowledge branch and the ambiguous/unrecognized fallback both
   * keep it `true`.
   */
  needsGeneralKnowledge: boolean;
}

const GENERAL_KNOWLEDGE_PATTERN = /\b(what is|what causes|what are|how does|how do|why do|explain|define|difference between)\b/i;
const FARM_REFERENCE_PATTERN = /\b(my |our |the farm|field|plot|robot|drone|mission|sensor|finding)\b/i;
const WEATHER_PATTERN = /\b(weather|forecast|rain|raining|temperature|humid|wind|spray|irrigat)\b/i;
const FLEET_PATTERN = /\b(robot|robots|drone|drones|fleet|rover|units?)\b/i;
const MISSION_PATTERN = /\b(mission|missions)\b/i;
const FINDING_PATTERN = /\b(finding|findings|problem|problems|pest|pests|disease|alert|alerts|issue|issues|wrong|damage|damaged|stress)\b/i;
const ANALYTICS_PATTERN = /\b(yield|analytics|disease risk|water usage|energy usage)\b/i;
const RECURRING_PATTERN = /\b(recurring|schedule|scheduled)\b/i;

/** Every domain included — the safe default this function always falls back to. */
function fullContextNeeds(targetPlotLabel: string | null, targetEntityName: string | null): ContextNeeds {
  return { fleet: true, missions: true, findings: true, weather: true, sensors: true, analytics: true, recurring: true, plotRecommendations: true, targetPlotLabel, targetEntityName, needsGeneralKnowledge: true };
}

/**
 * Resolves a specifically-named REAL
 * drone/robot, mirroring exactly how the existing `targetPlot` lookup above
 * resolves a real plot: a case-insensitive substring match against this
 * farm's own real fleet names, never a guessed/generic pattern. Checks
 * drones first, then robots — a farm's own naming convention (e.g. "Drone
 * Alpha" vs "Rover 2") makes a collision between the two fleets extremely
 * unlikely, and either match is equally valid for the "narrow the fleet
 * section to just this one" rendering step in `prompt-builder.ts`.
 */
function resolveTargetEntityName(normalized: string, context: AuraContext): string | null {
  const drone = context.drones.find((entry) => entry.name.trim().length > 0 && normalized.includes(entry.name.toLowerCase()));
  if (drone) return drone.name;
  const robot = context.robots.find((entry) => entry.name.trim().length > 0 && normalized.includes(entry.name.toLowerCase()));
  return robot?.name ?? null;
}

export function classifyContextNeeds(text: string, context: AuraContext): ContextNeeds {
  const normalized = text.trim().toLowerCase();

  // Resolve a specifically-named REAL plot — checked against this farm's
  // actual Plot Store data (`context.plots`), never invented. A field
  // question ("What's happening in Field B?") implicitly needs that field's
  // own findings/sensors (Part 5 Case D) even if it doesn't separately use
  // the word "finding"/"sensor".
  const targetPlot = context.plots.find((plot) => plot.label.trim().length > 0 && normalized.includes(plot.label.toLowerCase()));
  const targetPlotLabel = targetPlot?.label ?? null;
  const targetEntityName = resolveTargetEntityName(normalized, context);

  // A pure conceptual/definitional question with NO farm-specific reference
  // at all ("What causes fungal disease in wheat?", "What is crop
  // rotation?") needs none of the live farm-state domains — the static
  // agricultural knowledge reference (always in the stable prefix) answers
  // it. Plots/Robot Capabilities stay unconditionally included regardless
  // (see `prompt-builder.ts` — cheap, and several grounding rules depend on
  // Plots always being present to make an honest "no such plot" claim).
  if (GENERAL_KNOWLEDGE_PATTERN.test(normalized) && !FARM_REFERENCE_PATTERN.test(normalized) && !targetPlot) {
    return { fleet: false, missions: false, findings: false, weather: false, sensors: false, analytics: false, recurring: false, plotRecommendations: false, targetPlotLabel: null, targetEntityName: null, needsGeneralKnowledge: true };
  }

  const mentionsWeather = WEATHER_PATTERN.test(normalized);
  const mentionsFleet = FLEET_PATTERN.test(normalized) || targetEntityName !== null;
  const mentionsMission = MISSION_PATTERN.test(normalized);
  const mentionsFinding = FINDING_PATTERN.test(normalized);
  const mentionsAnalytics = ANALYTICS_PATTERN.test(normalized);
  const mentionsRecurring = RECURRING_PATTERN.test(normalized);

  const anyDomainMatched = mentionsWeather || mentionsFleet || mentionsMission || mentionsFinding || mentionsAnalytics || mentionsRecurring || targetPlot !== undefined;
  if (!anyDomainMatched) return fullContextNeeds(targetPlotLabel, targetEntityName);

  return {
    fleet: mentionsFleet,
    missions: mentionsMission,
    findings: mentionsFinding || targetPlot !== undefined,
    // AURA Reliability & Field Intelligence
 // Integration — a message that names a specific real plot
    // now also pulls in weather, not just findings/sensors/recommendations
    // (which already had this trigger). Field-correlation conversations
    // ("North Field." as a farmer's bare reply identifying which field is
    // affected) legitimately benefit from real recent weather — Part 6's
    // own worked example ("recent high humidity... recent rainfall") is
    // exactly this — and a bare field name alone would otherwise never
    // match `WEATHER_PATTERN`. Farm-wide, not per-plot (this app has no
    // per-plot weather data — see `types.ts`'s `AuraContext.weather`), but
    // still the single real weather snapshot, never fabricated.
    weather: mentionsWeather || targetPlot !== undefined,
    sensors: mentionsFinding || targetPlot !== undefined || mentionsWeather,
    analytics: mentionsAnalytics,
    recurring: mentionsRecurring || mentionsMission,
    plotRecommendations: targetPlot !== undefined || mentionsFinding,
    targetPlotLabel,
    targetEntityName,
    // Part 5/8 — a domain confidently matched (this branch only runs when
    // `anyDomainMatched` is true), so this is a real, specific farm-data
    // question — general crop/pest/disease reference definitions aren't
    // what it needs. `GENERAL_KNOWLEDGE_PATTERN` itself already only
    // reaches the OTHER branch above when there's NO farm reference at
    // all, so a message that got here always has one.
    needsGeneralKnowledge: false,
  };
}
