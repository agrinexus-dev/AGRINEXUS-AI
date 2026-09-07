import { matchTimeRangePhrase } from "@/lib/sensor-analytics/time-range-parser";

import type { AuraMissionRef, ParsedCommand, ParsedCommandParams } from "../types";

/**
 * Recognizes AURA commands by intent. Detection lives here regardless of
 * whether a command is actually executable — the Action Executor (Prompt
 * 013C, see `actions/action-executor.ts`) decides that, keyed off
 * `commandId`; a command recognized here but with no registered executor
 * handler still falls back to the existing "not available yet" reply
 * (see the chat route and `client/aura-chat-store.ts`), unchanged from
 */
interface CommandPattern {
  commandId: string;
  label: string;
  test: (normalized: string) => boolean;
}

/**
 * The (deliberately small) contextual signal
 * `parseCommand` can use to resolve a command that names NO vehicle kind at
 * all ("Create a mission for Plot A", "Start the mission", "Stop the
 * mission"). Currently just the page AURA was asked from — the one signal
 * this pure-text parser can be handed without becoming store-dependent
 * (every capture function in this file stays store-free by design; see the
 * top-of-file doc comment). `currentPage` is the exact same
 * `AuraContext.currentPage` value (`collect-context.ts`'s raw `usePathname()`
 * string) every other part of AURA already reads — no new source of truth.
 * A more specific signal (an actually-selected mission, checked against
 * live store state) is available to `action-executor.ts` and is tried
 * THERE, one tier further, before AURA ever asks the user to clarify — see
 * that file's "clarify-mission-vehicle" handler.
 */
export interface ParserContext {
  currentPage?: string;
  /**
   * Whether `usePendingActionStore` currently holds a
   * proposal awaiting a yes/no reply. Mirrors `currentPage`'s own role: the
   * one small piece of live state this otherwise store-free parser needs,
   * passed in rather than imported, so a bare "yes"/"no" is only ever
   * treated as CONFIRM_REPLY/CANCEL_REPLY below when something is actually
   * pending — otherwise it's ordinary chat (see `parseCommand`'s own guard).
   */
  hasPendingAction?: boolean;
  /**
   * the plot id most recently named (by either the farmer or AURA itself)
   * in the last few turns of THIS conversation, computed by
   * `extractMostRecentPlotId` in `aura-chat-store.ts` and passed in exactly
   * like `currentPage`/`hasPendingAction` above (this parser stays
   * store/history-free itself). Used ONLY as a narrow fallback when a
   * field-inspection request uses a pronoun ("check it again") instead of
   * naming a field, and ONLY when that fallback resolves to exactly the one
   * most-recently-named plot — never a guess among several candidates. When
   * unset (nothing plot-specific was said recently), the existing
   * ask-which-field / farm-has-only-one-plot behavior in
   * `handleFieldInspectionRequest` is completely unchanged.
   */
  recentPlotId?: string;
  /**
   * Every mission THIS
   * conversation has itself dispatched and tagged, most-recent-first (see
   * `aura-chat-store.ts`'s `missionRefsByMessageId`). Threaded straight
   * into `ParsedCommandParams.recentMissionRefs` (see that field's own doc
   * comment) for the mission-control commandIds below — this parser itself
   * makes no liveness/ambiguity decision about them, exactly like
   * `recentPlotId` above.
   */
  recentMissionRefs?: AuraMissionRef[];
}

/** `null` when page context doesn't resolve it — never a guess. */
function resolveVehicleKindFromPage(context: ParserContext | undefined): "drone" | "robot" | null {
  const page = context?.currentPage ?? "";
  if (page.startsWith("/drone-fleet/missions")) return "drone";
  if (page.startsWith("/ground-robots/missions")) return "robot";
  return null;
}

// See the "handle-selected-finding" pattern
// this backs, near the end of COMMAND_PATTERNS below, for the full
// reasoning. Kept as module-level regexes (not inline) so their intent is
// readable at a glance, matching this file's existing convention (e.g.
// `PLOT_LETTER` below).
const QUESTION_OPENERS = /^(which|what|who|why|when|where|how)\b/;
// "Is/are/does/do/did/was/were/has/have...?" is a genuine yes/no QUESTION
// ("Is my drone available?", "Did Rover 99 inspect Field Z yesterday?") —
// excluded. "Can/could/would you...?" is deliberately NOT in this list;
// see `isActionRequestForSelection`'s own doc comment. AURA Intelligence
// phase — added "did"/"was"/"were": found via live testing that a
// past-tense history question ("Did Rover 99 inspect Field Z yesterday?")
// was being misclassified by the LLM intent-classifier fallback as a NEW
// inspection request, since "did" wasn't excluded here (this same regex
// gates that classifier via `looksLikeInformationalQuestion`, not only the
// two deterministic patterns it originally served).
// Added "should": a genuine deliberative yes/no question
// ("Should I inspect Plot C today?") that live-testing (the audit)
// found was NOT excluded by this regex at all before this fix, since
// "should" wasn't in the opener list — the deterministic `plot-recommendation`
// and `inspect-plot` patterns below (neither of which consulted this list
// previously either) matched it as an ACTION instead of routing it to
// conversational AURA reasoning. "Can/could/would...?" remain deliberately
// OUT of this list (see `isActionRequestForSelection`'s doc comment below) —
// those are polite IMPERATIVES ("Can you fix this?" means "please fix
// this"), not deliberative questions like "should", so adding them here
// would wrongly exclude genuine action requests phrased politely.
const YES_NO_QUESTION_OPENERS = /^(is|are|does|do|did|was|were|has|have|should)\b/;
const ACTION_VERB_PHRASE = /(handle|resolve|fix|address|deal with|take care of|send (a |the )?(robot|drone|something|help)|assign (a |the )?robot)/;

/**
 * AURA Intelligence phase — the shared "does this look like a plain
 * informational question?" check, extracted so `aura-chat-store.ts` can
 * reuse the EXACT same exclusion the deterministic patterns above already
 * apply, deciding whether a message that the deterministic parser didn't
 * recognize is even worth sending to the LLM intent-classifier fallback
 *  — a genuine question ("What's wrong with Field B?") already gets
 * a real, context-grounded answer from the ordinary conversational path;
 * classifying it as a possible operational request first would only add
 * latency/cost for no benefit.
 */
// Live-verified
// regression, not assumed: a real, fresh end-to-end test through the
// actual Farmer AURA UI found that a genuine Urdu REASONING question
// ("کیا مجھے آج Plot C کا معائنہ کرنا چاہیے؟" — "Should I inspect Plot C
// today?") produced a real pending-action confirmation prompt, and
// answering it actually created a real mission — confirmed by directly
// testing `/api/aura/intent` with the exact same text: the LLM classifier
// returned `isFieldInspectionRequest: true` for this specific reasoning
// question. Root cause: `looksLikeInformationalQuestion` — which exists
// specifically to SKIP the LLM classifier for a message that already
// reads as a plain question (see `aura-chat-store.ts`'s own gating logic)
// — only recognized ENGLISH question openers, so it correctly shields an
// English reasoning question ("Why should I inspect Plot C today?") from
// ever reaching the classifier at all, but had NO equivalent protection
// for Urdu, meaning EVERY Urdu message the deterministic parser didn't
// recognize (question or not) was sent to the classifier, which then had
// its own independent (and in this reproduced case, wrong) judgment to
// make. Adding the already-existing `URDU_QUESTION_MARKERS` check here
// (the same constant `command-parser.ts` already uses for the identical
// purpose in `inspect-plot`/`isFieldInspectionRequest`) closes that gap at
// its root — an Urdu reasoning question now correctly never reaches the
// classifier at all, exactly like its English equivalent already didn't.
export function looksLikeInformationalQuestion(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return QUESTION_OPENERS.test(normalized) || YES_NO_QUESTION_OPENERS.test(normalized) || URDU_QUESTION_MARKERS.test(normalized);
}

function isActionRequestForSelection(text: string): boolean {
  if (QUESTION_OPENERS.test(text) || YES_NO_QUESTION_OPENERS.test(text)) return false;
  if (!/\b(this|it)\b/.test(text)) return false;
  return ACTION_VERB_PHRASE.test(text);
}

// AURA Natural-Language-Actions phase, Parts 2–4 — a Farmer expressing an
// inspection request in ordinary language, WITHOUT referring to an
// already-selected Digital Twin finding ("this"/"it" — that's
// `isActionRequestForSelection` above). Two shapes are recognized:
//
//  1. An explicit inspection VERB ("check", "scan", "inspect", "look at",
//  "have a look at", "go see", "investigate", "see what's wrong with")
//  — matches every worked example in Part 2/4/7/26 verbatim.
//  2. A PROBLEM REPORT with no inspection verb at all ("There are bugs
//  eating my crops in field B" — Part 4's own Test B) — recognized by a
//  problem-noun ("pest"/"insect"/"bug"/"weed"/"fungal"/"disease"/
//  "water"/"dry") paired with an action-implying verb ("eating",
//  "damaging", "attacking", "spreading", "killing", or a bare "there
//  is/are a/an <problem>").
//
// Deliberately verb-PHRASE matching (like `ACTION_VERB_PHRASE` above), not
// a literal string list — "intent-based rather than a growing collection of
// brittle exact-string commands" (Part 2's own requirement). Field/plot
// resolution and problem→capability mapping happen in the Action Executor
// against real farm data, never here (this file stays store/type-free).
const INSPECTION_VERB_PHRASE =
  /\b(check|scan|inspect|investigate|examine)\b|\b(look at|have a look at|take a look at|go see|go check|go look at|go inspect|see what'?s wrong with|see what is wrong with|send (?:a |the )?(?:robot|drone) to)\b/;
// "nutrient deficiency"/"crop stress"/"damaged
// crop" name real `CropIssueType`s too (`findings/types.ts`), just ones with
// no robot-capable corrective action (`ROBOT_ISSUE_CAPABILITIES`). Before
// this fix, none of the three were recognized here at all, so a request
// like "Fix the nutrient deficiency in plot B" never reached
// `isFieldInspectionRequest`'s resolve branch or `detectMissionIntent` — it
// fell through to the older LLM-classifier fallback path instead, which
// knows nothing about mission intent or capability, and silently offered a
// plain inspection instead of ever surfacing the honest "no authorized
// treatment action" refusal this path must give. Live-tested and fixed.
const PROBLEM_NOUN =
  /\b(pest|pests|insect|insects|bug|bugs|aphid|aphids|weed|weeds|fungal|fungus|mold|mould|mildew|disease|diseased|flood|flooding|standing water|waterlog|dry|drought|irrigation|watering|nutrient|nutrients|nutrient deficiency|deficiency|crop stress|stressed crops?|damaged crop|damaged area|damage[ds]?)\b/;
const PROBLEM_ACTION_VERB = /\b(eating|damaging|attacking|infest\w*|spreading|killing|ruining|destroying)\b/;

// The two intent shapes beyond plain inspect/investigate
// (see `MissionIntentKind`'s own doc comment in `types.ts`). "watch"/
// "keep an eye on"/"surveil"/"monitor" are farmer-natural synonyms for
// routine surveillance, not a request about any specific problem — PATROL
// never needs a `PROBLEM_NOUN` match. "fix"/"resolve"/"address"/"treat"/
// "clear up"/"get rid of"/"deal with"/"take care of" all imply the farmer
// wants the problem actually ACTED on, not merely looked at — but only
// count as a resolve REQUEST when paired with a real problem noun (a bare
// "take care of the farm" names no problem at all).
const PATROL_VERB_PHRASE = /\b(patrol|watch|keep an eye on|surveil|monitor)\b/;
const RESOLVE_VERB_PHRASE = /\b(fix|resolve|address|treat|clear up|get rid of|deal with|take care of)\b/;

// "بھیج" (the root of بھیجو/بھیجے/بھیج دو, "send") —
// mirrors English's own `INSPECTION_VERB_PHRASE` "send (?:a |the)?
// (?:robot|drone) to" alternative, live-tested necessary: ACTION-2 in this
// milestone's own required matrix ("ڈرون 1 کو پلاٹ C پر بھیجو" — "Send
// Drone 1 to Plot C") has no explicit "inspect" word at all (same shape as
// English's own "send a drone to Plot C", which already matches via that
// existing clause) — the LLM classifier fallback correctly resolved the
// PLOT but returned `isFieldInspectionRequest: false` for this exact
// phrase, live-verified against the real `/api/aura/intent` endpoint (see
// the earlier Urdu Command Results). Checked by PRESENCE, not
// word order — Urdu's SOV structure naturally places the vehicle word
// BEFORE "بھیج", the reverse of English's "send [vehicle] to" order.
const URDU_SEND_VERB = /بھیج/;

function isFieldInspectionRequest(text: string): boolean {
  if (QUESTION_OPENERS.test(text) || YES_NO_QUESTION_OPENERS.test(text)) return false;
  if (PATROL_VERB_PHRASE.test(text)) return true;
  if (INSPECTION_VERB_PHRASE.test(text)) return true;
  if (RESOLVE_VERB_PHRASE.test(text) && PROBLEM_NOUN.test(text)) return true;
  // The Urdu "send [vehicle] to [plot]" shape. Excludes
  // `URDU_QUESTION_MARKERS` for the identical reason the English checks
  // above exclude `QUESTION_OPENERS`/`YES_NO_QUESTION_OPENERS`: without it,
  // "ڈرون کیوں بھیجنا چاہیے؟" ("Why should [we] send a drone?" —
  // CONVERSATIONAL-4 in the required matrix) would
  // false-positive, since "بھیجنا" (the infinitive "to send") contains the
  // "بھیج" root as a substring. Live-verified this exclusion correctly
  // keeps that exact example conversational while still matching ACTION-2.
  if (!URDU_QUESTION_MARKERS.test(text) && URDU_SEND_VERB.test(text) && URDU_VEHICLE_PREFERENCE.test(text)) return true;
  // A bare problem report ("there's pest activity in field B" / "insects are
  // eating my crops") needs EITHER an explicit action verb alongside the
  // problem noun, or a "there is/are" framing — a lone mention of a problem
  // word inside an unrelated sentence must not trigger a mission (e.g. "the
  // pest report from last week looked fine" is a genuine question, not a
  // new inspection request — excluded by requiring one of these two shapes).
  if (!PROBLEM_NOUN.test(text)) return false;
  return PROBLEM_ACTION_VERB.test(text) || /\bthere(?:'s| is| are)\b/.test(text);
}

/**
 * Sections 7–8 — the structured `MissionIntentKind` a field-operation
 * request resolves into, checked in priority order: PATROL first (its own
 * verb never overlaps with inspect/resolve wording), then RESOLVE (only
 * when a real problem is also named — resolving nothing isn't a thing),
 * then INVESTIGATE (a problem was named but with a plain inspect-style verb
 * or no verb at all), defaulting to plain INSPECT. Purely a text
 * classification — which real `RobotMissionType`/`MissionType` this becomes,
 * and whether a "resolve" is actually capability-backed, is entirely the
 * Action Executor's job against real data (`handleFieldInspectionRequest`),
 * never guessed here.
 */
function detectMissionIntent(text: string): "inspect" | "patrol" | "investigate" | "resolve" {
  if (PATROL_VERB_PHRASE.test(text)) return "patrol";
  if (RESOLVE_VERB_PHRASE.test(text) && PROBLEM_NOUN.test(text)) return "resolve";
  if (PROBLEM_NOUN.test(text)) return "investigate";
  return "inspect";
}

// Same "field OR plot" letter reference, kept separate from the existing
// `PLOT_LETTER`/`plotId`/`plotLabel` helpers above (which several OTHER,
// unrelated commands already depend on) so widening it to accept "field"
// can't change any existing command's behavior.
const FIELD_OR_PLOT_LETTER = /\b(?:field|plot)\s*([a-d])\b/i;

// `URDU_PLOT_LETTER` fallback, same fallback-only
// reasoning as `matchPlotLetter` above (only ever consulted when the
// English/"field" form isn't present) — needed so `request-field-
// inspection`'s new Urdu "send drone" branch (`isFieldInspectionRequest`,
// via `URDU_SEND_VERB`) can actually resolve WHICH plot, not just recognize
// that a plot was named.
function requestedPlotId(normalized: string): string | undefined {
  const match = normalized.match(FIELD_OR_PLOT_LETTER) ?? normalized.match(URDU_PLOT_LETTER);
  return match ? `plot-${match[1]!.toLowerCase()}` : undefined;
}

// A field-inspection request that refers back to a field by pronoun instead of
// naming it ("Can you check it again?", "Check that field once more").
// Deliberately narrow (a real "this"/"it"/"that" reference to A FIELD, not a
// bare "it"/"this" that could mean anything) so this never fires for a
// request that already stands fine on its own with no field mentioned at
// all elsewhere in the sentence.
const FIELD_PRONOUN_REFERENCE = /\b(it|that field|this field|the field|that plot|this plot)\b/;

function referencesFieldPronoun(normalized: string): boolean {
  return FIELD_PRONOUN_REFERENCE.test(normalized);
}

/**
 * The single most-recently-named plot id across the given texts (most
 * recent first — the caller passes recent conversation turns in that
 * order), or `undefined` if none of them name one. Exported for
 * `aura-chat-store.ts` to compute `ParserContext.recentPlotId` from the
 * live transcript — this file otherwise never sees conversation history
 * (see this file's own top-of-file doc comment on staying store/history
 * free); this is a pure text function over caller-supplied strings, same as
 * every other capture function here.
 */
export function extractMostRecentPlotId(texts: string[]): string | undefined {
  for (const text of texts) {
    const match = text.toLowerCase().match(FIELD_OR_PLOT_LETTER);
    if (match) return `plot-${match[1]!.toLowerCase()}`;
  }
  return undefined;
}

function reportedProblemKeyword(normalized: string): string | undefined {
  const match = normalized.match(PROBLEM_NOUN);
  return match ? match[0] : undefined;
}

// An EXPLICIT vehicle preference ("Can a drone check Field B?", "Send the
// robot."). Deliberately narrow: only a direct "drone"/"robot" (or "rover",
// a common farmer synonym already used in the examples)
// mention counts — "use whatever is available" is deliberately NOT matched
// here (no preference is the correct, honest reading of that phrase; the
// Action Executor's existing capability-driven selection already handles
// "no preference" correctly). Never both at once — if a message somehow
// names both, this returns whichever appears first, matching how a farmer
// reading their own sentence back would resolve it.
const VEHICLE_PREFERENCE = /\b(drone|robot|rover)\b/;
// "ڈرون" (drone), "روبوٹ" (robot) — the Urdu mirror,
// same fallback-only role as `URDU_PLOT_LETTER` above (see that constant's
// own doc comment): only ever consulted when the English form isn't
// present, so no existing English-triggered call site's behavior changes.
const URDU_VEHICLE_PREFERENCE = /(ڈرون|روبوٹ)/;

function requestedVehiclePreference(normalized: string): "robot" | "drone" | undefined {
  const match = normalized.match(VEHICLE_PREFERENCE);
  if (match) return match[1] === "drone" ? "drone" : "robot";
  const urduMatch = normalized.match(URDU_VEHICLE_PREFERENCE);
  if (!urduMatch) return undefined;
  return urduMatch[1] === "ڈرون" ? "drone" : "robot";
}

// A Farmer's short reply to AURA's own confirmation question ("Would you like me to
// assign the mission?"). Each CLAUSE (split on commas — see
// `isIntentPhrase` below) must be an EXACT match to one of these short
// phrases, so an ordinary sentence that happens to contain "yes"/"no"
// ("yes, but what about Plot B?", "no worries") never gets swept in — only
// a genuine short confirm/cancel reply does, including the natural
// multi-clause phrasing Part 8 itself lists ("No, don't do it."). `parseCommand`
// additionally requires `context.hasPendingAction` before either pattern is
// honored at all (see its own guard) — with nothing pending, a bare "yes"/
// "ok" falls through to the AI provider as ordinary conversation, exactly
// as before this change.
const CONFIRM_PHRASES = ["yes", "yep", "yeah", "yup", "sure", "ok", "okay", "go ahead", "do it", "send it", "start it", "yes please", "please do", "confirm"];
const CANCEL_PHRASES = ["no", "nope", "nah", "cancel", "never mind", "nevermind", "don't", "dont", "don't do it", "dont do it", "not now", "stop"];

/** Every non-empty clause (split on `,`/`;`, trimmed, trailing `.`/`!` stripped) must be an exact match against `phrases` — this is what lets "No, don't do it." match (both clauses are cancel phrases) while rejecting "yes, but what about Plot B?" (its second clause is neither confirm nor cancel). */
function isIntentPhrase(text: string, phrases: string[]): boolean {
  const clauses = text
    .split(/[,;]/)
    .map((clause) => clause.trim().replace(/[.!]+$/, ""))
    .filter((clause) => clause.length > 0);
  if (clauses.length === 0) return false;
  return clauses.every((clause) => phrases.includes(clause));
}

const CONFIRM_REPLY = { test: (text: string) => isIntentPhrase(text, CONFIRM_PHRASES) };
const CANCEL_REPLY = { test: (text: string) => isIntentPhrase(text, CANCEL_PHRASES) };

const PLOT_LETTER = /plot\s*([a-d])\b/i;

// Live-tested (not
// assumed) via the real `/api/aura/intent` LLM classifier against this
// milestone's own required Urdu test matrix before adding this: the
// classifier correctly left every CONVERSATIONAL Urdu example unrecognized
// (no false positives — the reasoning-vs-action boundary already holds for
// Urdu with zero code changes), but reliably FAILED the pure-Urdu ACTION
// examples ("پلاٹ C کا معائنہ کرو", "ڈرون 1 کو پلاٹ C پر بھیجو") —
// `isFieldInspectionRequest` came back `false` for both, live-reproduced
// against the real endpoint. Per the "only if the existing
// behavior fails in a way that requires deterministic recognition, minimally
// extend the existing command-parser architecture" instruction — see the
// The earlier Urdu Command Results section for the full matrix.
//
// This is a NARROW, additive mirror of `inspect-plot`'s own English pattern
// below, not a general Urdu grammar engine: it recognizes exactly the
// tested shape ("پلاٹ" + a plot letter; "معائنہ" the inspection verb/noun
// root) and nothing more exotic. The plot LETTER itself stays Latin (A–D) —
// confirmed by every live test case above (this app's own plot labels are
// never transliterated into Urdu digits/letters) — only the surrounding
// Urdu grammar differs, so `URDU_PLOT_LETTER` mirrors `PLOT_LETTER` exactly
// except for the literal "plot"/"پلاٹ" word itself.
const URDU_PLOT_LETTER = /پلاٹ\s*([a-d])\b/i;
// "معائنہ" (root: inspection/examination) — appears in both the noun
// ("پلاٹ C کا معائنہ" = "Plot C's inspection") and the imperative verb
// phrase ("معائنہ کرو"/"معائنہ کریں" = "do an inspection") tested live.
// Unlike English, this file does not attempt a separate noun/verb word-
// boundary distinction for Urdu (Urdu morphology inflects the noun form
// differently — "معائنے" — so the bare-noun false-positive `\binspect\b`
// fix isn't the same shape here); the `URDU_QUESTION_MARKERS` exclusion
// below is what actually carries the reasoning-vs-action boundary for Urdu,
// mirroring `QUESTION_OPENERS`/`YES_NO_QUESTION_OPENERS`'s role in English.
const URDU_INSPECT_VERB = /معائنہ/;
// Urdu question/deliberative markers — DELIBERATELY checked by presence
// ANYWHERE in the text, not anchored to the start like English's
// `QUESTION_OPENERS`: Urdu word order is far more flexible than English,
// and live testing's own CONVERSATIONAL-2 example ("مجھے پلاٹ C کا معائنہ
// کیوں کرنا چاہیے؟" — "why should I inspect Plot C?") places "کیوں" (why)
// mid-sentence, immediately before the verb, not at the sentence's start —
// an anchored check would have missed it entirely. "کیا" (a generic yes/no
// question particle, "is/does/what"), "کیوں" (why), and "چاہیے" (should/
// ought to — Urdu's closest equivalent to English's "should" opener)
// together covered every CONVERSATIONAL example in the required test
// matrix, confirmed live.
// "کیسی"/"کیسا"/"کیسے" ("how is X" in Urdu's three
// gendered/plural adjective forms): live testing of the required
// example ("Plot C کی فصل کیسی ہے؟" / "پلاٹ C کی فصل کیسی ہے؟" —
// "How is Plot C's crop?") found this genuine informational question was
// NOT excluded by the marker list above (it contains neither "کیا", "کیوں",
// nor "چاہیے" as a substring), so it fell through to the LLM intent
// classifier — which, given a message naming a specific plot, misread it
// as a field-inspection action request, triggering the deterministic
// (English-only-template) action-executor instead of a normal reasoning
// reply. The pre-existing regression test at
// tests/urdu/aura-behavior.spec.ts:83 ("آج میرے فارم کی حالت کیسی ہے؟")
// did not catch this because it names no plot letter, so the deterministic
// inspect-plot action path never had a PLOT_LETTER to match against —
// masking the gap. Fixed the same way the two gaps above were: adding the
// missing question word(s) to this existing allowlist, not redesigning it.
const URDU_QUESTION_MARKERS = /کیا|کیوں|چاہیے|کیسی|کیسا|کیسے/;

/** `PLOT_LETTER` first (the common case), falling back to `URDU_PLOT_LETTER` only when the English form isn't present — every OTHER command that calls this shares this fallback for free, but it only ever activates for text that also satisfies ITS OWN (still English-only, unchanged) `test()` via the Urdu `inspect-plot` branch added in Phase D below; no other pattern's matching behavior changes. */
function matchPlotLetter(normalized: string): RegExpMatchArray | null {
  return normalized.match(PLOT_LETTER) ?? normalized.match(URDU_PLOT_LETTER);
}

function plotLabel(normalized: string): string {
  const match = matchPlotLetter(normalized);
  return match ? `Plot ${match[1]!.toUpperCase()}` : "Plot";
}

function plotId(normalized: string): string | undefined {
  const match = matchPlotLetter(normalized);
  return match ? `plot-${match[1]!.toLowerCase()}` : undefined;
}

/** "every 10 minutes" / "every 2 hours" / "every hour" → a plain minute count. Defaults to 10 minutes when no interval phrase is found at all, rather than rejecting the whole command over a missing number — matches this file's existing "degrade gracefully to a sensible default" convention (e.g. `matchMissionType` falling back to "survey"). */
function parseIntervalMinutes(normalized: string): number {
  const hourMatch = normalized.match(/every\s+(\d+)\s*hours?/);
  if (hourMatch) return Number(hourMatch[1]) * 60;
  if (/every\s+hour/.test(normalized)) return 60;
  const minuteMatch = normalized.match(/every\s+(\d+)\s*min(?:ute)?s?/);
  if (minuteMatch) return Number(minuteMatch[1]);
  return 10;
}

// Captures TWO distinct plot letters anywhere in the
// text (e.g. "compare plot a and plot b", "compare the condition of plot a
// and plot b"). Kept separate from `COMPARE_SENSORS_PATTERN` below and
// checked first (see `compare-plots`'s position at the top of
// COMMAND_PATTERNS) so a genuine plot-vs-plot comparison — previously
// misrouted into the sensor-name comparison command, which then failed with
// a confusing "I couldn't find... in the sensor network" error — is
// recognized as its own command instead.
const TWO_PLOT_LETTERS = /plot\s*([a-d])\b[\s\S]*?\bplot\s*([a-d])\b/i;

function comparePlotIds(normalized: string): [string, string] | undefined {
  const match = normalized.match(TWO_PLOT_LETTERS);
  if (!match) return undefined;
  const first = match[1]!.toLowerCase();
  const second = match[2]!.toLowerCase();
  if (first === second) return undefined; // same plot named twice — not a real comparison
  return [`plot-${first}`, `plot-${second}`];
}

/** "plot-a" → "Plot A" — a plain string transform, no store lookup, matching every other capture function in this file. */
function plotLabelFromLetter(id: string): string {
  return `Plot ${id.slice(-1).toUpperCase()}`;
}

// Captures the name after "drone" so any fleet drone can be located by name
// "Locate Drone Alpha", "Locate Drone Charlie", etc. —
// rather than only the one hardcoded "drone alpha" phrase 013C recognized.
// Resolving whether that name actually matches a real fleet drone happens
// in the Action Executor (which has Fleet Store access); this parser stays
// a pure text function with no store dependency, same as before.
const LOCATE_DRONE_NAME = /drone\s+([a-z0-9]+)/i;

function locateDroneName(normalized: string): string | undefined {
  return normalized.match(LOCATE_DRONE_NAME)?.[1];
}

// Same idea for ground robots — "Locate Robot Bravo", "Locate
// Robot Charlie", etc.
const LOCATE_ROBOT_NAME = /robot\s+([a-z0-9]+)/i;

function locateRobotName(normalized: string): string | undefined {
  return normalized.match(LOCATE_ROBOT_NAME)?.[1];
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
}

// Mission Planning commands. Kept a pure text function with no
// Mission Store dependency, same rule `LOCATE_DRONE_NAME` above already
// follows for the Fleet Store: resolving a captured name/type against real
// data happens in the Action Executor, not here.
const ASSIGN_DRONE_NAME = /assign\s+drone\s+([a-z0-9]+)/i;

function assignDroneName(normalized: string): string | undefined {
  return normalized.match(ASSIGN_DRONE_NAME)?.[1];
}

/** Longer/more specific aliases first, same convention `LAYER_NAMES` below already uses, so e.g. "crop health mission" wins over a bare "survey" fallback never even being reached. */
const MISSION_TYPE_NAMES: { type: string; label: string; aliases: string[] }[] = [
  // "crop inspection" added so a phrase like "recurring
  // drone crop inspection" (the example command) resolves
  // here — there's no separate `MissionType` for it, and "Crop Health
  // Inspection" is the curated label for the same intent
  // (see `recurring-missions-panel.tsx`).
  // "crop issue detection" added (the DRONE
  // example command: "Create a crop issue detection mission for Plot A").
  // Without a recognized type word here, that phrase has no vehicle word
  // AND no type word — the genuine zero-signal case this change's new
  // ambiguity handling treats as needing clarification — but Part 4
  // explicitly categorizes it as unambiguously DRONE, same as "crop
  // health"/"crop inspection" already are.
  { type: "crop-health", label: "Crop Health", aliases: ["crop health", "crop inspection", "crop issue detection"] },
  { type: "disease-scan", label: "Disease Scan", aliases: ["disease scan"] },
  { type: "thermal-scan", label: "Thermal Scan", aliases: ["thermal scan"] },
  { type: "ndvi", label: "NDVI", aliases: ["ndvi"] },
  { type: "rgb-capture", label: "RGB Capture", aliases: ["rgb capture"] },
  { type: "irrigation-inspection", label: "Irrigation Inspection", aliases: ["irrigation inspection"] },
  { type: "emergency-inspection", label: "Emergency Inspection", aliases: ["emergency inspection"] },
  { type: "manual", label: "Manual Flight", aliases: ["manual flight"] },
  { type: "survey", label: "Survey", aliases: ["survey"] },
];

function matchMissionType(normalized: string): { type: string; label: string } | null {
  for (const entry of MISSION_TYPE_NAMES) {
    if (entry.aliases.some((alias) => normalized.includes(alias))) return entry;
  }
  return null;
}

/** Captures free text after "<verb> mission " (e.g. "start mission north field survey" → "north field survey") — undefined when no name follows, so the Action Executor falls back to the currently selected mission. */
function missionNameAfterVerb(normalized: string, verb: string): string | undefined {
  const match = normalized.match(new RegExp(`${verb}\\s+mission\\s+(.+)$`, "i"));
  return match?.[1]?.trim() || undefined;
}

/** Same idea, for the "mission <keyword> [name]" phrasing (Mission Status/Progress/ETA/Battery). */
function missionNameAfterKeyword(normalized: string, keyword: string): string | undefined {
  const match = normalized.match(new RegExp(`mission\\s+${keyword}\\s+(.+)$`, "i"));
  return match?.[1]?.trim() || undefined;
}

// Ground Robot Fleet Management commands. Same pure-text-only
// rule as every capture above: resolving a captured name against the Robot
// Store happens in the Action Executor, never here. Robot names are a single
// token (e.g. "charlie"), unlike mission names, so these capture one word,
// not "rest of string".
function robotNameAfterVerb(normalized: string, verb: string): string | undefined {
  const match = normalized.match(new RegExp(`${verb}\\s+robot\\s+([a-z0-9]+)`, "i"));
  return match?.[1];
}

const SEND_ROBOT_HOME_NAME = /send\s+robot\s+([a-z0-9]+)\s+home/i;
function sendRobotHomeName(normalized: string): string | undefined {
  return normalized.match(SEND_ROBOT_HOME_NAME)?.[1];
}

/** Deliberately requires "maintenance[ mode][ for] robot <name>" — the canonical phrasing — rather than every possible word order, same scoping choice `ASSIGN_DRONE_NAME` already makes for drones. Missing/unrecognized phrasing just leaves the name undefined; the Action Executor then falls back to the Robot Store's own `selectedRobotId`, same fallback `resolveMission` uses when no mission name is given. */
const MAINTENANCE_ROBOT_NAME = /maintenance(?:\s+mode)?\s+(?:for\s+)?robot\s+([a-z0-9]+)/i;
function maintenanceRobotName(normalized: string): string | undefined {
  return normalized.match(MAINTENANCE_ROBOT_NAME)?.[1];
}

/** Same idea as `missionNameAfterKeyword`, for the "robot <keyword> [name]" phrasing (Robot Status/Battery/Location/Health). */
function robotNameAfterKeyword(normalized: string, keyword: string): string | undefined {
  const match = normalized.match(new RegExp(`robot\\s+${keyword}\\s+(.+)$`, "i"));
  return match?.[1]?.trim() || undefined;
}

/** Generic layer recognition (013B) — kept for hide/show and for layers with no dedicated 013C action (still just acknowledged, not executed). Longer/more specific aliases first so e.g. "crop health" wins over bare "crop". */
const LAYER_NAMES: { key: string; label: string; aliases: string[] }[] = [
  { key: "cropHealth", label: "Crop Health", aliases: ["crop health", "crop"] },
  { key: "diseaseRisk", label: "Disease Risk", aliases: ["disease risk", "disease"] },
  { key: "irrigation", label: "Irrigation", aliases: ["irrigation"] },
  { key: "droneCoverage", label: "Drone Coverage", aliases: ["drone coverage", "coverage"] },
  { key: "decorations", label: "Decorations", aliases: ["decorations", "decoration"] },
  { key: "soilMoisture", label: "Soil Moisture", aliases: ["soil moisture", "soil"] },
  { key: "temperature", label: "Temperature", aliases: ["temperature"] },
  { key: "humidity", label: "Humidity", aliases: ["humidity"] },
  { key: "sensorNetwork", label: "Sensor Network", aliases: ["sensor network", "sensor"] },
  { key: "energy", label: "Energy", aliases: ["energy"] },
];

/** Only these 5 have a real Action Executor handler this change. */
const ACTIONABLE_LAYER_KEYS = new Set(["cropHealth", "diseaseRisk", "irrigation", "droneCoverage", "decorations"]);

function matchLayer(normalized: string): { key: string; label: string } | null {
  for (const entry of LAYER_NAMES) {
    if (entry.aliases.some((alias) => normalized.includes(alias))) return { key: entry.key, label: entry.label };
  }
  return null;
}

/** Page navigation targets — one data-driven table instead of one pattern per page. Only mission-control/digital-twin have a real route today; the rest resolve honestly ("no dedicated page yet") in the Action Executor, not fabricated here. */
const PAGE_TARGETS: { target: string; label: string; aliases: string[] }[] = [
  { target: "mission-control", label: "Mission Control", aliases: ["mission control"] },
  { target: "digital-twin", label: "Digital Twin", aliases: ["digital twin"] },
  { target: "drone-fleet", label: "Drone Fleet", aliases: ["drone fleet"] },
  { target: "ground-robots", label: "Ground Robots", aliases: ["ground robots"] },
  { target: "sensor-network", label: "Sensor Network", aliases: ["sensor network"] },
  // Checked before the generic "analytics" entry below — its
  // alias set is a superset-containing phrase ("sensor analytics" includes
  // "analytics"), so this must win the `.find()` race for that phrase.
  { target: "sensor-analytics", label: "Sensor Analytics", aliases: ["sensor analytics", "analytics center"] },
  { target: "weather", label: "Weather", aliases: ["weather"] },
  { target: "energy", label: "Energy", aliases: ["energy"] },
  { target: "analytics", label: "Analytics", aliases: ["analytics"] },
  { target: "alerts", label: "Alerts", aliases: ["alerts", "alert"] },
  { target: "reports", label: "Reports", aliases: ["reports", "report"] },
  { target: "settings", label: "Settings", aliases: ["settings"] },
];

function matchPageTarget(normalized: string): { target: string; label: string } | null {
  for (const entry of PAGE_TARGETS) {
    if (entry.aliases.some((alias) => normalized.includes(alias))) return entry;
  }
  return null;
}

// Ground Robot Mission Planner commands. Mirrors the
// MISSION_TYPE_NAMES/missionNameAfterVerb/missionNameAfterKeyword pattern
// already established for drone missions, retargeted to the literal "robot
// mission" phrase everywhere so these commands can never fire for a drone
// Mission and vice versa. Longer/more specific aliases first, same
// convention every other alias table here follows.
const ROBOT_MISSION_TYPE_NAMES: { type: string; label: string; aliases: string[] }[] = [
  { type: "crop-inspection", label: "Crop Inspection", aliases: ["crop inspection"] },
  // "weed" added so a phrase like "recurring robot weed
  // inspection" (the example command) resolves here rather
  // than falling through to the generic "inspection" catch-all below.
  { type: "weed-detection", label: "Weed Detection", aliases: ["weed detection", "weed"] },
  { type: "targeted-spraying", label: "Targeted Spraying", aliases: ["targeted spraying", "spraying"] },
  { type: "precision-fertilization", label: "Precision Fertilization", aliases: ["precision fertilization", "fertilization"] },
  { type: "soil-sampling", label: "Soil Sampling", aliases: ["soil sampling"] },
  { type: "seed-planting", label: "Seed Planting", aliases: ["seed planting", "planting"] },
  { type: "ground-imaging", label: "Ground Imaging", aliases: ["ground imaging", "imaging"] },
  { type: "autonomous-patrol", label: "Autonomous Patrol", aliases: ["autonomous patrol", "patrol"] },
  { type: "manual-drive", label: "Manual Drive", aliases: ["manual drive"] },
  { type: "crop-inspection", label: "Crop Inspection", aliases: ["inspection"] },
];

function matchRobotMissionType(normalized: string): { type: string; label: string } | null {
  for (const entry of ROBOT_MISSION_TYPE_NAMES) {
    if (entry.aliases.some((alias) => normalized.includes(alias))) return entry;
  }
  return null;
}

/** Captures free text after "<verb> robot mission " — mirrors `missionNameAfterVerb`. Undefined when no name follows, so the Action Executor falls back to the currently selected robot mission. */
function robotMissionNameAfterVerb(normalized: string, verb: string): string | undefined {
  const match = normalized.match(new RegExp(`${verb}\\s+robot\\s+mission\\s+(.+)$`, "i"));
  return match?.[1]?.trim() || undefined;
}

/** Same idea, for the "robot mission <keyword> [name]" phrasing (Robot Mission Status/Progress/ETA/Battery) — mirrors `missionNameAfterKeyword`. */
function robotMissionNameAfterKeyword(normalized: string, keyword: string): string | undefined {
  const match = normalized.match(new RegExp(`robot\\s+mission\\s+${keyword}\\s+(.+)$`, "i"));
  return match?.[1]?.trim() || undefined;
}

// Smart Sensor Network commands. Same pure-text-only rule as
// every capture above: resolving a captured name/type against the Sensor
// Store happens in the Action Executor, never here — this list of type
// phrases exists purely so the TEST functions below can recognize "Locate
// Soil Moisture Sensor"/"Locate Weather Station" as sensor-locate commands
// even when the literal word "sensor" isn't present (a local copy of the
// label strings, same convention `MISSION_TYPE_NAMES`/`ROBOT_MISSION_TYPE_NAMES`
// already establish rather than importing `SensorType` here).
const SENSOR_TYPE_QUERY_WORDS = [
  "soil moisture",
  "soil temperature",
  "air temperature",
  "humidity",
  "electrical conductivity",
  "nitrogen",
  "phosphorus",
  "potassium",
  "rain gauge",
  "wind speed",
  "wind direction",
  "solar radiation",
  "light intensity",
  "leaf wetness",
  "water tank level",
  "flow meter",
  "weather station",
];

function mentionsSensor(normalized: string): boolean {
  return /\bsensor/.test(normalized) || SENSOR_TYPE_QUERY_WORDS.some((phrase) => normalized.includes(phrase));
}

/** Captures free text after "<verb> " for sensor commands — e.g. "locate soil moisture sensor" → "soil moisture sensor", "locate sensor alpha" → "sensor alpha". The Action Executor tries a type-phrase match first, then a name/id match. */
function sensorQueryAfterVerb(normalized: string, verb: string): string | undefined {
  const match = normalized.match(new RegExp(`${verb}\\s+(.+)$`, "i"));
  return match?.[1]?.trim() || undefined;
}

/** Same idea, for the "sensor <keyword> [name]" phrasing (Sensor Status/Battery/Reading/Health). */
function sensorQueryAfterKeyword(normalized: string, keyword: string): string | undefined {
  const match = normalized.match(new RegExp(`sensor\\s+${keyword}\\s+(.+)$`, "i"));
  return match?.[1]?.trim() || undefined;
}

// Sensor Analytics & Historical Intelligence commands. Same
// pure-text-only rule as every capture above.
const COMPARE_SENSORS_PATTERN = /compare\s+(.+?)\s+(?:and|vs\.?|with)\s+(.+)$/i;

function compareSensorNames(normalized: string): [string, string] | undefined {
  const match = normalized.match(COMPARE_SENSORS_PATTERN);
  if (!match) return undefined;
  return [match[1]!.trim(), match[2]!.trim()];
}

/** Captures the heatmap type phrase out of "show heatmap <type>"/"show <type> heatmap" — the Action Executor matches it against a small alias table to pick the real layer key. */
function heatmapQuery(normalized: string): string | undefined {
  const afterKeyword = normalized.match(/heatmap\s+(?:for\s+)?(.+)$/i)?.[1]?.trim();
  if (afterKeyword) return afterKeyword;
  const beforeKeyword = normalized.match(/show\s+(.+?)\s+heatmap/i)?.[1]?.trim();
  return beforeKeyword || undefined;
}

const COMMAND_PATTERNS: CommandPattern[] = [
  // Recurring Missions. Inserted before EVERYTHING else
  // (including `create-mission`/`create-robot-mission` below, whose own
  // broader "/create/ + /mission/" tests would otherwise also match "Create
  // a recurring drone inspection...") — same array-position-only precedence
  // technique every other block in this file already uses.
  {
    commandId: "create-recurring-mission",
    label: "Create Recurring Mission",
    test: (text) => /create/.test(text) && /recurring/.test(text) && /(drone|robot)/.test(text),
  },
  {
    commandId: "list-recurring-missions",
    label: "List Recurring Missions",
    test: (text) => /(show|list|view)/.test(text) && /recurring/.test(text),
  },
  {
    commandId: "stop-recurring-mission",
    label: "Stop Recurring Mission",
    test: (text) => /(stop|disable|cancel)/.test(text) && /recurring/.test(text),
  },
  // The "start"/"resume/enable" counterpart to
  // `stop-recurring-mission` above (which only added stop). Checked
  // AFTER stop/disable/cancel in this same array, but since none of THOSE
  // verbs overlap with start/resume/enable there's no real ordering
  // dependency between the two — listed second purely for readability.
  {
    commandId: "start-recurring-mission",
    label: "Start Recurring Mission",
    test: (text) => /(start|resume|enable)/.test(text) && /recurring/.test(text),
  },

  // Global autonomous-behavior toggles. All five require
  // the literal word "autonomous", which no earlier pattern in this array
  // tests for, so there's no real ordering dependency with anything above
  // — listed here purely because it's the same "vehicle behavior" family
  // as the recurring-mission block right above it. `show-autonomous-status`
  // is listed last and excludes every enable/disable/start/stop verb, so a
  // phrase like "turn on drone autonomous mode" always matches the enable
  // pattern first regardless of array position.
  {
    // A real bug found via live testing: "turn on"/
    // "turn off" required the literal ADJACENT substring, but this change's
    // own test phrasing is "Turn drone autonomous mode ON" — "on"/"off"
    // sits at the END of the sentence, not immediately after "turn", so
    // NONE of the 4 enable/disable patterns matched it at all, and it fell
    // through to `show-autonomous-status` below (whose own exclusion list
    // had the identical adjacency bug, so it didn't exclude this phrasing
    // either) — reporting current status instead of actually toggling
    // anything. Fixed by checking for the WHOLE WORD "on"/"off" anywhere in
    // the phrase (`\bon\b`/`\boff\b`) instead of requiring it glued to
    // "turn" — "turn... on" and "turn... off" both now match regardless
    // of what sits in between.
    commandId: "enable-drone-autonomous",
    label: "Enable Drone Autonomous Behavior",
    test: (text) => /autonomous/.test(text) && /drone/.test(text) && !/robot/.test(text) && /(enable|allow|\bstart\b|\bon\b)/.test(text),
  },
  {
    commandId: "disable-drone-autonomous",
    label: "Disable Drone Autonomous Behavior",
    test: (text) => /autonomous/.test(text) && /drone/.test(text) && !/robot/.test(text) && /(disable|\bstop\b|\boff\b)/.test(text),
  },
  {
    commandId: "enable-robot-autonomous",
    label: "Enable Robot Autonomous Behavior",
    test: (text) => /autonomous/.test(text) && /robot/.test(text) && /(enable|allow|\bstart\b|\bon\b)/.test(text),
  },
  {
    commandId: "disable-robot-autonomous",
    label: "Disable Robot Autonomous Behavior",
    test: (text) => /autonomous/.test(text) && /robot/.test(text) && /(disable|\bstop\b|\boff\b)/.test(text),
  },
  {
    commandId: "show-autonomous-status",
    label: "Show Autonomous Behavior Status",
    test: (text) => /autonomous/.test(text) && !/(enable|disable|allow|\bstart\b|\bstop\b|\bon\b|\boff\b)/.test(text),
  },

  // Plot Comparison. Inserted before EVERYTHING else,
  // including the plot-recommendation final-pass block right below (whose own `plot-
  // recommendation` test also fires on some "compare"-free phrasing but
  // never on "compare") — a "compare plot X and plot Y" phrase must win
  // over `compare-sensors` further down this array, which previously
  // intercepted it (both patterns start with the literal word "compare") and
  // tried to resolve "the condition of plot a" as a sensor name, producing a
  // confusing failure instead of a real plot-to-plot comparison. Same
  // array-position-only precedence technique every other block in this file
  // already uses — no pre-existing pattern's `test` function is touched.
  {
    commandId: "compare-plots",
    label: "Compare Plots",
    test: (text) => /compare/.test(text) && TWO_PLOT_LETTERS.test(text) && comparePlotIds(text) !== undefined,
  },

  // Agricultural Reasoning & Sensor-Driven
  // Missions. Inserted FIRST — before every other block, including the
  // 016B Sensor Analytics block right below — because several of these
  // phrases ("create an irrigation mission BASED ON THE SENSOR DATA",
  // "should we INSPECT or irrigate Plot A") would otherwise also satisfy an
  // earlier, broader test (`create-mission`'s bare /create/ + /mission/,
  // `inspect-plot`'s bare /inspect/ + a plot letter) further down this same
  // array. Array position is the ONLY thing that changes here — no
  // pre-existing pattern's `test` function is touched, same rule every
  // other block in this file already follows.
  {
    commandId: "create-sensor-mission",
    label: "Create Sensor-Driven Mission",
    test: (text) => /create/.test(text) && /mission/.test(text) && /sensor/.test(text),
  },
  {
    // Excludes genuine natural-language QUESTIONS ("Why should
    // I inspect Plot C today?", "Should I inspect Plot C today?", "Do you
    // think I should inspect Plot C?", "Why did Plot C get an inspection
    // recommendation?"). Before this fix, none of this pattern's four OR
    // clauses excluded question-openers at all, so any of them — the bare
    // `/should.*(irrigat|inspect)/` and bare `/recommend/` clauses especially
    // — matched a REASONING/EXPLANATION question exactly the same as a
    // direct command, short-circuiting it into this narrow, engine-only
    // response instead of letting it reach conversational AURA (which has
    // the exact same Plot Recommendation data plus full farm context to
    // reason with). Live-verified via a standalone probe against this real
    // function —. This exclusion makes the
    // `/what should/` clause effectively unreachable (a "what should..."
    // sentence is itself a QUESTION_OPENERS match) — left in place rather
    // than removed, per this change's "smallest additive fix" rule; a
    // non-question, direct invocation of this command (if one exists in the
    // UI) is unaffected, since it never starts with a question opener.
    commandId: "plot-recommendation",
    label: "Plot Recommendation",
    test: (text) =>
      !QUESTION_OPENERS.test(text) &&
      !YES_NO_QUESTION_OPENERS.test(text) &&
      PLOT_LETTER.test(text) &&
      (/what should/.test(text) || /should.*(irrigat|inspect)/.test(text) || (/why/.test(text) && /flag/.test(text)) || /recommend/.test(text)),
  },
  {
    commandId: "fields-needing-irrigation",
    label: "Fields Needing Irrigation",
    test: (text) => /(which|what)/.test(text) && /(field|plot)/.test(text) && /(dry|drying|moisture|irrigat)/.test(text),
  },
  {
    commandId: "fields-needing-inspection",
    label: "Fields Needing Inspection",
    test: (text) => /(which|what)/.test(text) && /(field|plot)/.test(text) && /inspect/.test(text),
  },
  {
    commandId: "plot-trend",
    label: "Plot Trend",
    test: (text) => PLOT_LETTER.test(text) && /(chang|trend)/.test(text),
  },

  // Sensor Analytics & Historical Intelligence. Inserted
  // before the 016A block below (checked in declaration order by
  // `parseCommand`'s `.find()`) — several of these phrases ("show sensor
  // alerts", "sensor trend x") would otherwise also satisfy 016A's broader
  // `show-sensor`/`sensor-reading`-style tests, so array position resolves
  // it the same way every other command family in this file already does.
  // No 016A pattern's `test` function is touched.
  {
    commandId: "compare-sensors",
    label: "Compare Sensors",
    test: (text) => /compare/.test(text) && COMPARE_SENSORS_PATTERN.test(text),
  },
  {
    commandId: "show-sensor-alerts",
    label: "Show Sensor Alerts",
    test: (text) => /(show|list|view)/.test(text) && /sensor/.test(text) && /alerts?/.test(text),
  },
  {
    commandId: "show-heatmap",
    label: "Show Heatmap",
    test: (text) => /heatmap/.test(text),
  },
  {
    commandId: "show-soil-moisture-trend",
    label: "Show Soil Moisture Trend",
    test: (text) => /show/.test(text) && /soil moisture/.test(text) && /trend/.test(text),
  },
  {
    commandId: "show-temperature-trend",
    label: "Show Temperature Trend",
    test: (text) => /show/.test(text) && /temperature/.test(text) && /trend/.test(text),
  },
  {
    commandId: "sensor-trend",
    label: "Sensor Trend",
    test: (text) => /sensor\s+trend/.test(text),
  },
  {
    commandId: "sensor-statistics",
    label: "Sensor Statistics",
    test: (text) => /sensor\s+(statistics|stats)/.test(text),
  },

  // Smart Sensor Network. Inserted FIRST (checked in
  // declaration order by `parseCommand`'s `.find()` below), the same
  // precedence-via-array-position technique the robot-mission patterns
  // use — every pattern below requires `mentionsSensor` or the literal
  // "sensor" keyword, which no earlier drone/robot/mission pattern's test
  // needs, but ordering these first is a free extra safety margin and keeps
  // every new command family in one predictable place at the top of this
  // array. No pre-existing pattern's `test` function is touched.
  {
    commandId: "show-offline-sensors",
    label: "Show Offline Sensors",
    test: (text) => /(show|list|view)/.test(text) && /offline\s+sensors?/.test(text),
  },
  {
    commandId: "show-critical-sensors",
    label: "Show Critical Sensors",
    test: (text) => /(show|list|view)/.test(text) && /critical\s+sensors?/.test(text),
  },
  {
    commandId: "list-sensors",
    label: "List Sensors",
    test: (text) => /(list|show|view)/.test(text) && /sensors\b/.test(text) && !/offline/.test(text) && !/critical/.test(text) && !/network/.test(text),
  },
  {
    commandId: "sensor-status",
    label: "Sensor Status",
    test: (text) => /sensor\s+status/.test(text),
  },
  {
    commandId: "sensor-battery",
    label: "Sensor Battery",
    test: (text) => /sensor\s+battery/.test(text),
  },
  {
    commandId: "sensor-reading",
    label: "Sensor Reading",
    test: (text) => /sensor\s+reading/.test(text),
  },
  {
    commandId: "sensor-health",
    label: "Sensor Health",
    test: (text) => /sensor\s+health/.test(text),
  },
  {
    commandId: "locate-sensor",
    label: "Locate Sensor",
    test: (text) => /locate/.test(text) && mentionsSensor(text),
  },
  {
    commandId: "show-sensor",
    label: "Show Sensor",
    test: (text) => /show/.test(text) && /\bsensor\b/.test(text) && !/network/.test(text) && !/status|battery|reading|health/.test(text),
  },

  // Ground Robot Mission Planner. Inserted before every older
  // pattern below (checked in declaration order by `parseCommand`'s
  // `.find()`) so every one of these — all requiring the literal "robot
  // mission" phrase —
  // takes priority over any existing pattern with a broader test that could
  // otherwise also match it (e.g. the drone "pause-mission" pattern below
  // only tests `/pause/ && /mission/`, which "pause robot mission" would
  // technically satisfy too; putting this block first means THIS pattern
  // wins instead). Every pre-existing pattern below is completely untouched
  // — this block only changes precedence via array position, never anyone
  // else's `test` function.
  {
    commandId: "create-robot-mission",
    label: "Create Robot Mission",
    // Widened from the literal adjacent "robot mission"
    // substring to "contains 'robot' AND 'mission' anywhere," so a phrase
    // like "Create a robot weed detection mission for Plot A" (the word
    // "robot" separated from "mission" by the mission-type words) is
    // correctly recognized as robot-fleet intent instead of silently
    // falling through to `create-mission`'s broader drone-default pattern.
    // Does NOT fix the zero-signal case — a phrase with no "robot" word at
    // all (e.g. "Create a weed detection mission for Plot A") still can't
    // be told apart from drone intent by text alone; resolving that would
    // need page-context plumbing this pattern doesn't add.
    test: (text) => /create/.test(text) && /robot/.test(text) && /mission/.test(text),
  },
  {
    commandId: "assign-robot-to-mission",
    label: "Assign Robot",
    test: (text) => /assign/.test(text) && /robot/.test(text) && /mission/.test(text),
  },
  {
    commandId: "start-robot-mission",
    label: "Start Robot Mission",
    test: (text) => /start/.test(text) && /robot mission/.test(text),
  },
  {
    commandId: "pause-robot-mission",
    label: "Pause Robot Mission",
    // Uses `\bpause\b` (word-boundary) instead of a bare
    // substring, plus excluding a genuine QUESTION: without this, "Why is
    // the robot mission PAUSED?"/"Is the robot mission paused?" (a real
    // status-query phrasing — the "Is the robot still working?" family)
    // matched "pause" as a bare substring of
    // "paused" and got routed into the pause-ACTION handler instead of ever
    // reaching the ordinary conversational/status-query path. The handler
    // also does real work (cross-store resolution, a real state transition
    // attempt), so this gap matters more than a bare substring match would
    // suggest.
    test: (text) => /\bpause\b/.test(text) && /robot mission/.test(text) && !QUESTION_OPENERS.test(text) && !YES_NO_QUESTION_OPENERS.test(text),
  },
  {
    commandId: "resume-robot-mission",
    label: "Resume Robot Mission",
    test: (text) => /\bresume\b/.test(text) && /robot mission/.test(text) && !QUESTION_OPENERS.test(text) && !YES_NO_QUESTION_OPENERS.test(text),
  },
  {
    // "stop" added as a synonym for "cancel" (there was no
    // "stop" verb recognized anywhere for missions before this; "Stop the
    // robot mission" is one of the explicit test phrases).
    // Same word-boundary + question exclusion as `pause-
    // robot-mission` above: "Why was the robot mission CANCELLED?" must
    // never match this (bare `/cancel/` matches inside "cancelled").
    commandId: "cancel-robot-mission",
    label: "Cancel Robot Mission",
    test: (text) => /\b(cancel|stop)\b/.test(text) && /robot mission/.test(text) && !QUESTION_OPENERS.test(text) && !YES_NO_QUESTION_OPENERS.test(text),
  },
  {
    commandId: "delete-robot-mission",
    label: "Delete Robot Mission",
    test: (text) => /delete/.test(text) && /robot mission/.test(text),
  },
  {
    commandId: "duplicate-robot-mission",
    label: "Duplicate Robot Mission",
    test: (text) => /duplicate/.test(text) && /robot mission/.test(text),
  },
  {
    commandId: "show-active-robot-missions",
    label: "Show Active Robot Missions",
    test: (text) => /(show|list|view)/.test(text) && /active robot mission/.test(text),
  },
  {
    commandId: "list-robot-missions",
    label: "List Robot Missions",
    test: (text) => /(list|show|view)/.test(text) && /robot mission/.test(text) && !/active/.test(text),
  },
  {
    commandId: "locate-robot-mission",
    label: "Locate Robot Mission",
    test: (text) => /locate/.test(text) && /robot mission/.test(text),
  },
  {
    commandId: "robot-mission-status",
    label: "Robot Mission Status",
    test: (text) => /robot\s+mission\s+status/.test(text),
  },
  {
    commandId: "robot-mission-progress",
    label: "Robot Mission Progress",
    test: (text) => /robot\s+mission\s+progress/.test(text),
  },
  {
    commandId: "robot-mission-eta",
    label: "Robot Mission ETA",
    test: (text) => /robot\s+mission\s+eta/.test(text),
  },
  {
    commandId: "robot-mission-battery",
    label: "Robot Mission Battery",
    test: (text) => /robot\s+mission\s+battery/.test(text),
  },
  {
    commandId: "launch-inspection",
    label: "Launch inspection",
    test: (text) => /launch/.test(text) && /inspection/.test(text),
  },
  {
    // Excludes "create"+"mission" phrasing, a real bug
    // found via live testing: "Create an irrigation INSPECTION mission for
    // Plot B" (the DRONE example command) contains both
    // "inspect" (inside "inspection") and a plot letter, so it used to match
    // HERE — a camera-focus command requiring the Digital Twin page open —
    // instead of ever reaching `create-mission` further down this array,
    // which is what the phrase actually means. This pattern's own intent
    // ("Inspect Plot A" as a standalone camera command) is unaffected: it
    // never contains the word "mission".
    // Two additive fixes, live-verified via a standalone probe
    // against this real function ():
    //  1. Word-bounded `/inspect/` to `\binspect\b` — the old bare
    //  substring match also matched "inspectION" (the NOUN, as in "the
    //  inspection status of Plot C" or "an inspection mission"), which
    //  is someone talking ABOUT an inspection, not asking for one. The
    //  verb "inspect" is a genuine action signal; the noun "inspection"
    //  is not.
    //  2. Excludes question-openers, same rationale as `plot-recommendation`
    //  just above — "Why should I inspect Plot C today?" contains the
    //  standalone verb "inspect" and a plot letter, so it matched HERE as
    //  an action before this fix, when it should reach conversational
    //  AURA instead. The two genuine ACTION examples this pattern must
    //  keep matching ("Inspect Plot C.", "Send Drone 1 to inspect Plot
    //  C.") start with neither opener list, so both are unaffected.
    // Extended to recognize the "inspect verb" and the
    // "plot reference" independently in EITHER script (English or Urdu),
    // not only as matching same-script pairs — required for genuinely
    // MIXED-language input, live-verified necessary: "Plot C کا معائنہ کرو"
    // (Latin plot name + Urdu verb, one of the required
    // MIXED test cases) has NO Urdu "پلاٹ" at all, so a same-script-only
    // Urdu branch would miss it even though it should plainly become an
    // action — real, reproduced failure against this exact function before
    // this generalization ().
    // Same commandId, same array position, same executor path
    // (`action-executor.ts`'s `case "inspect-plot"`) regardless of which
    // script combination matched — never a second/parallel action path.
    commandId: "inspect-plot",
    label: "Inspect Plot",
    test: (text) =>
      !QUESTION_OPENERS.test(text) &&
      !YES_NO_QUESTION_OPENERS.test(text) &&
      !URDU_QUESTION_MARKERS.test(text) &&
      (/\binspect\b/.test(text) || URDU_INSPECT_VERB.test(text)) &&
      (PLOT_LETTER.test(text) || URDU_PLOT_LETTER.test(text)) &&
      !(/create/.test(text) && /mission/.test(text)),
  },
  {
    // Same fix, for the identical reason — "Create a thermal SCAN mission
    // for Plot B" would otherwise match here first instead of reaching
    // `create-mission` (matchMissionType's "thermal scan" alias).
    commandId: "scan-plot",
    label: "Scan Plot",
    test: (text) => /scan/.test(text) && PLOT_LETTER.test(text) && !(/create/.test(text) && /mission/.test(text)),
  },
  {
    commandId: "focus-plot",
    label: "Focus Plot",
    test: (text) => /focus/.test(text) && PLOT_LETTER.test(text),
  },
  {
    commandId: "reset-camera",
    label: "Reset Camera",
    test: (text) => /reset/.test(text) && /camera/.test(text),
  },
  {
    commandId: "locate-drone",
    label: "Locate Drone",
    test: (text) => /locate/.test(text) && LOCATE_DRONE_NAME.test(text),
  },
  {
    // Generalized from the old hardcoded "locate robot bravo"
    // stub into a real fleet-wide command, mirroring "locate-drone" exactly
    // — "Locate Robot Bravo"/"Locate Robot Charlie"/etc. all resolve against
    // the Robot Store in the Action Executor now, rather than only ever
    // locating the one hardcoded unit.
    commandId: "locate-robot",
    label: "Locate Robot",
    test: (text) => /locate/.test(text) && LOCATE_ROBOT_NAME.test(text),
  },
  {
    commandId: "generate-report",
    label: "Generate report",
    test: (text) => /(generate|create|build)/.test(text) && /report/.test(text),
  },
  {
    commandId: "set-layer",
    label: "Set layer",
    test: (text) => {
      if (!/(enable|disable)/.test(text) || !/layer/.test(text)) return false;
      const layer = matchLayer(text);
      return layer !== null && ACTIONABLE_LAYER_KEYS.has(layer.key);
    },
  },
  {
    commandId: "layer-toggle",
    label: "Toggle layer",
    test: (text) => /(hide|show|enable|disable)/.test(text) && /layer/.test(text) && matchLayer(text) !== null,
  },
  {
    commandId: "presentation-mode",
    label: "Presentation Mode",
    test: (text) => /(start|stop)/.test(text) && /presentation mode/.test(text),
  },
  {
    commandId: "query-last-action",
    label: "What was my last action?",
    test: (text) => /last action/.test(text),
  },
  {
    commandId: "open-page",
    label: "Open page",
    test: (text) => /(open|show)/.test(text) && matchPageTarget(text) !== null,
  },
  {
    commandId: "show-unhealthy-crops",
    label: "Show unhealthy crops",
    test: (text) => /unhealthy|sick|diseased|stressed/.test(text) && /crop|plant|field/.test(text),
  },
  {
    // "start"/"stop" REMOVED from this verb list. They
    // used to be bundled in here as a historical convenience ("start a
    // drone mission" ~= "create one"), but that meant "Start the drone
    // mission" (an EXISTING mission, per this file's own "Start Mission"
    // command elsewhere) was silently misrouted into CREATING a brand new
    // one instead — a real bug found via live testing, not a
    // hypothetical. "create"/"schedule"/"launch" all genuinely mean
    // "make a new one" and stay; "start"/"stop" now fall through to the
    // real start-mission/cancel-mission patterns below, same as every other
    // mission-lifecycle verb.
    commandId: "create-drone-mission",
    label: "Create drone mission",
    test: (text) => /(create|schedule|launch)/.test(text) && /drone mission|drone flight/.test(text),
  },

  // Mission Planning & Flight Operations. Every test below
  // explicitly excludes "drone mission"/"drone flight" phrasing so it can
  // never shadow (or be shadowed by) the generic stub above.
  {
    commandId: "create-mission",
    label: "Create Mission",
    test: (text) => /create/.test(text) && /mission/.test(text) && !/drone mission|drone flight/.test(text),
  },
  {
    commandId: "assign-drone-to-mission",
    label: "Assign Drone",
    test: (text) => /assign/.test(text) && ASSIGN_DRONE_NAME.test(text),
  },
  {
    // The "!/drone mission|drone flight/" exclusion this
    // pattern used to carry is REMOVED: it existed only so `create-drone-
    // mission`'s (now-removed, see that pattern's own comment) bundled
    // "start" verb could claim "start the drone mission" first. With that
    // verb gone, the exclusion just meant "Start the drone mission" — one
    // of the explicit test phrases — matched NO deterministic
    // pattern at all (a real bug, found via live testing: it silently fell
    // through to the general AI path instead of actually starting the
    // mission). "Start the robot mission" is still unaffected — that
    // pattern is positioned earlier in this array and always wins first.
    commandId: "start-mission",
    label: "Start Mission",
    test: (text) => /start/.test(text) && /mission/.test(text),
  },
  {
    // Same word-boundary + question-exclusion reasoning as
    // `pause-robot-mission`'s own comment: a bare `/pause/` matches inside
    // "paused", so "Is the mission paused?"/"Why is it paused?" used to
    // misfire into the pause-ACTION handler.
    commandId: "pause-mission",
    label: "Pause Mission",
    test: (text) => /\bpause\b/.test(text) && /mission/.test(text) && !QUESTION_OPENERS.test(text) && !YES_NO_QUESTION_OPENERS.test(text),
  },
  {
    commandId: "resume-mission",
    label: "Resume Mission",
    test: (text) => /\bresume\b/.test(text) && /mission/.test(text) && !QUESTION_OPENERS.test(text) && !YES_NO_QUESTION_OPENERS.test(text),
  },
  {
    // "stop" added as a synonym for "cancel", mirroring
    // "cancel-robot-mission" above. Positioned after every "robot mission"
    // pattern in this array (unchanged), so "stop the robot mission" always
    // wins that pattern first — this one only fires when no "robot" word
    // was present at all.
    // Word-boundary + question exclusion, same reasoning:
    // "Why was that mission cancelled?" (the "explain a cancelled mission
    // later" requirement) must reach the
    // ordinary conversational path, never this action handler — a bare
    // `/cancel/` matches inside "cancelled".
    commandId: "cancel-mission",
    label: "Cancel Mission",
    test: (text) => /\b(cancel|stop)\b/.test(text) && /mission/.test(text) && !QUESTION_OPENERS.test(text) && !YES_NO_QUESTION_OPENERS.test(text),
  },
  {
    commandId: "delete-mission",
    label: "Delete Mission",
    test: (text) => /delete/.test(text) && /mission/.test(text),
  },
  {
    commandId: "duplicate-mission",
    label: "Duplicate Mission",
    test: (text) => /duplicate/.test(text) && /mission/.test(text),
  },
  {
    // Widened from requiring the literal adjacent
    // substring "active mission" to just requiring both words "active" and
    // "mission" present anywhere, so "Show active DRONE missions" (this
    // phase's own test phrase — "drone" breaks the old adjacency) is
    // recognized. Still positioned after `show-active-robot-missions`
    // above, so "active robot mission(s)" phrasing is unaffected — that
    // more specific pattern always wins the array-order race first.
    commandId: "show-active-missions",
    label: "Show Active Missions",
    test: (text) => /(show|list|view)/.test(text) && /active/.test(text) && /mission/.test(text),
  },
  {
    // The drone-side equivalent of `list-robot-missions`
    // which already existed; there was previously no way to
    // list ALL drone missions (only "active" ones, via the pattern above).
    // Excludes "robot mission" (positioned after every robot-mission
    // pattern anyway, but explicit here too, matching this array's usual
    // belt-and-suspenders convention), "active" (already its own command
    // above), and "recurring" (its own command family entirely).
    commandId: "list-missions",
    label: "List Missions",
    // Also excludes status/progress/eta/battery — those are handled by the
    // more specific `mission-<keyword>` patterns later in this array, and
    // without this exclusion "show mission status" would incorrectly match
    // HERE first (array position, same precedence rule this whole file
    // uses) instead of reaching that pattern.
    test: (text) =>
      /(list|show|view)/.test(text) &&
      /mission/.test(text) &&
      !/robot mission/.test(text) &&
      !/active/.test(text) &&
      !/recurring/.test(text) &&
      !/status|progress|eta|battery/.test(text),
  },
  {
    commandId: "locate-mission",
    label: "Locate Mission",
    test: (text) => /locate/.test(text) && /mission/.test(text),
  },
  {
    commandId: "mission-status",
    label: "Mission Status",
    test: (text) => /mission\s+status/.test(text),
  },
  {
    commandId: "mission-progress",
    label: "Mission Progress",
    test: (text) => /mission\s+progress/.test(text),
  },
  {
    commandId: "mission-eta",
    label: "Mission ETA",
    test: (text) => /mission\s+eta/.test(text),
  },
  {
    commandId: "mission-battery",
    label: "Mission Battery",
    test: (text) => /mission\s+battery/.test(text),
  },

  // Ground Robot Fleet Management. "locate-robot" (the
  // fleet-wide generalization of the old "locate robot bravo" stub) is
  // defined earlier, alongside "locate-drone", since it shares that same
  // shape/neighborhood.
  {
    commandId: "pause-robot",
    label: "Pause Robot",
    test: (text) => /pause/.test(text) && /robot/.test(text),
  },
  {
    commandId: "resume-robot",
    label: "Resume Robot",
    test: (text) => /resume/.test(text) && /robot/.test(text),
  },
  {
    commandId: "send-robot-home",
    label: "Send Robot Home",
    test: (text) => /send/.test(text) && /robot/.test(text) && /home/.test(text),
  },
  {
    commandId: "maintenance-mode-robot",
    label: "Maintenance Mode",
    test: (text) => /maintenance/.test(text) && /robot/.test(text),
  },
  {
    commandId: "assign-robot",
    label: "Assign Robot",
    test: (text) => /assign/.test(text) && /robot/.test(text),
  },
  {
    commandId: "robot-status",
    label: "Robot Status",
    test: (text) => /robot\s+status/.test(text),
  },
  {
    commandId: "robot-battery",
    label: "Robot Battery",
    test: (text) => /robot\s+battery/.test(text),
  },
  {
    commandId: "robot-location",
    label: "Robot Location",
    test: (text) => /robot\s+location/.test(text),
  },
  {
    commandId: "robot-health",
    label: "Robot Health",
    test: (text) => /robot\s+health/.test(text),
  },
  {
    commandId: "show-active-robots",
    label: "Show Active Robots",
    test: (text) => /(show|list|view)/.test(text) && /active\s+robots?/.test(text),
  },
  {
    commandId: "list-robots",
    label: "List Robots",
    // Excludes "active" so this doesn't shadow "show-active-robots" above —
    // same disambiguation convention `show-active-missions` already needs no
    // special-casing for (it requires the literal substring "active
    // mission"), spelled out explicitly here since "robots" alone is a much
    // more common substring than "active mission" is.
    test: (text) => /(list|show|view)\s+robots?\b/.test(text) && !/active/.test(text),
  },
  {
    // Deterministic "List Drones", mirroring `list-robots`
    // exactly (identical shape, `!/active/` exclusion for the same reason).
    // "mission" is also excluded so "list drone missions" correctly falls
    // through to `list-missions` instead — the two are both "verb + drone(s)
    // immediately after" vs "verb +... + mission" and would otherwise both
    // match this one phrase.
    commandId: "list-drones",
    label: "List Drones",
    test: (text) => /(list|show|view)\s+drones?\b/.test(text) && !/active/.test(text) && !/mission/.test(text),
  },
  {
    // A Farmer selects a
    // finding in the Digital Twin, then asks AURA to act on "this"/"it"
    // rather than naming a mission/robot explicitly. Deliberately requires
    // BOTH a real action verb AND a "this"/"it" reference, and deliberately
    // excludes question openers, so a genuine information-seeking question
    // ("Which robot can handle this?", "Is my drone available?" — Part 4's
    // own examples, which must still get a normal AI answer using real
    // context, never a silent action) never matches here. "Can you...?" is
    // kept as the one exception, since English uses it as a polite
    // imperative for a real request (Part 4's own worked example: "Can you
    // take care of this?"). Positioned LAST — every more specific existing
    // pattern above (assign a NAMED robot, send a robot home, etc.) still
    // wins first, unchanged.
    commandId: "handle-selected-finding",
    label: "Handle Selected Issue",
    test: (text) => isActionRequestForSelection(text),
  },
  {
    // AURA Natural-Language-Actions phase, Parts 2–9 — see
    // `isFieldInspectionRequest`'s own doc comment. Positioned after
    // `handle-selected-finding` (no practical overlap — see that pattern's
    // verb list vs `INSPECTION_VERB_PHRASE`/`PROBLEM_NOUN` above) and after
    // every more specific existing plot/mission command, so an exact
    // existing command always still wins first, unchanged.
    commandId: "request-field-inspection",
    label: "Request Field Inspection",
    test: (text) => isFieldInspectionRequest(text),
  },
  {
    // Only ever reached as a real command when
    // `context.hasPendingAction` is true (see `parseCommand`'s guard right
    // after matching); otherwise `parseCommand` returns `{recognized: false}`
    // itself before this commandId ever reaches the Action Executor.
    commandId: "confirm-pending-action",
    label: "Confirm Pending Action",
    test: (text) => CONFIRM_REPLY.test(text),
  },
  {
    commandId: "cancel-pending-action",
    label: "Cancel Pending Action",
    test: (text) => CANCEL_REPLY.test(text),
  },

  // Vehicle-agnostic
  // natural mission control with NO "mission"/"robot"/"drone" keyword at all
  // ("Pause it.", "Stop the robot.", "Resume it.", "Continue the mission.",
  // "Cancel it."). Positioned LAST: every existing "pause"/"resume"/
  // "cancel"+"mission"/"robot" pattern above requires one of those literal
  // keywords, so an explicit "Pause the robot mission"/"Pause the drone
  // mission" phrasing keeps matching its own existing, unchanged pattern
  // first — these three only catch what nothing above already claims.
  // Positioned AFTER "cancel-pending-action" specifically so a bare "Cancel."
  // reply to an actual pending proposal is never shadowed by this broader
  // catch-all (see that pattern's own exact-phrase `isIntentPhrase` check —
  // it never matches "cancel it"/"cancel that mission" at all, only a bare
  // "cancel", so there's no real overlap beyond that one word). "Cancel that
  // mission."/"Stop this mission." already match the EXISTING `cancel-
  // mission` (drone) pattern above (both keywords present) — that case's own
  // handler in action-executor.ts gains the identical cross-store fallback
  // resolution these three commands use, rather than duplicating a 4th
  // pattern for the same phrase shape.
  {
    commandId: "pause-active-mission",
    label: "Pause Mission",
    // "Stop the robot"/"Stop it" reads as a temporary halt (resumable), not
    // a terminal abort — mapped to pause, the safer, reversible reading of
    // an ambiguous "stop", never to the irreversible cancel.
    test: (text) =>
      /\b(pause|stop)\b/.test(text) &&
      !/\bmission\b/.test(text) &&
      !/\brecurring\b/.test(text) &&
      !/\bpresentation mode\b/.test(text) &&
      !/\bautonomous\b/.test(text) &&
      !QUESTION_OPENERS.test(text) &&
      !YES_NO_QUESTION_OPENERS.test(text),
  },
  {
    commandId: "resume-active-mission",
    label: "Resume Mission",
    test: (text) =>
      /\b(resume|continue)\b/.test(text) &&
      !/\brecurring\b/.test(text) &&
      !/\bautonomous\b/.test(text) &&
      !QUESTION_OPENERS.test(text) &&
      !YES_NO_QUESTION_OPENERS.test(text),
  },
  {
    commandId: "cancel-active-mission",
    label: "Cancel Mission",
    test: (text) => /\b(cancel|abort)\b/.test(text) && !/\brecurring\b/.test(text) && !QUESTION_OPENERS.test(text) && !YES_NO_QUESTION_OPENERS.test(text),
  },

  // A farmer correcting an ALREADY-PROPOSED vehicle choice
  // ("Use the drone instead.", "Send the robot.", "Actually send Robot
  // Bravo.") without repeating the whole request. Deliberately narrow: a
  // bare vehicle-kind mention with NO field/plot letter and no verb this
  // file already recognizes as its own request — every other "robot"/
  // "drone" command above requires an additional keyword ("mission",
  // "pause", "assign", "home", etc.) or a plot letter, so this only ever
  // catches what nothing more specific already claimed. Positioned LAST for
  // exactly that reason. If nothing is actually pending when this resolves
  // (action-executor.ts's `resolveVehicleOverride`), the farmer is told so
  // plainly — never a guess at what they meant.
  {
    commandId: "override-pending-vehicle",
    label: "Override Vehicle",
    test: (text) =>
      VEHICLE_PREFERENCE.test(text) &&
      !FIELD_OR_PLOT_LETTER.test(text) &&
      !isFieldInspectionRequest(text) &&
      !QUESTION_OPENERS.test(text) &&
      !YES_NO_QUESTION_OPENERS.test(text) &&
      !/\bmission\b/.test(text),
  },
];

export function parseCommand(input: string, context?: ParserContext): ParsedCommand {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return { recognized: false };

  const match = COMMAND_PATTERNS.find((pattern) => pattern.test(normalized));
  if (!match) return { recognized: false };

  // The gate described on `ParserContext.hasPendingAction`
  // and the two patterns above: a bare "yes"/"no" is only ever a real
  // confirm/cancel command while something is genuinely pending.
  if ((match.commandId === "confirm-pending-action" || match.commandId === "cancel-pending-action") && !context?.hasPendingAction) {
    return { recognized: false };
  }

  // Mutable so the create/start/cancel-mission cases below
  // can retarget a genuinely ambiguous phrase (no "drone"/"robot" word
  // anywhere) to the resolved vehicle kind's REAL commandId, or to
  // "clarify-mission-vehicle" when even page context can't resolve it.
  // Every other case leaves this as `match.commandId`, unchanged from
  // before this change.
  let commandId = match.commandId;
  let label = match.label;
  let params: ParsedCommandParams | undefined;

  switch (match.commandId) {
    case "create-recurring-mission": {
      const vehicleKind = /\brobot\b/.test(normalized) && !/\bdrone\b/.test(normalized) ? "robot" : "drone";
      const intervalMinutes = parseIntervalMinutes(normalized);
      const type = vehicleKind === "drone" ? matchMissionType(normalized) : matchRobotMissionType(normalized);
      label = `Create Recurring ${vehicleKind === "drone" ? "Drone" : "Robot"} Mission`;
      params = { vehicleKind, missionType: type?.type, plotId: plotId(normalized), intervalMinutes };
      break;
    }
    case "list-recurring-missions": {
      label = "Show Recurring Missions";
      break;
    }
    case "stop-recurring-mission": {
      label = `Stop Recurring Mission${plotId(normalized) ? ` for ${plotLabel(normalized)}` : ""}`;
      params = { plotId: plotId(normalized) };
      break;
    }
    case "start-recurring-mission": {
      label = `Start Recurring Mission${plotId(normalized) ? ` for ${plotLabel(normalized)}` : ""}`;
      params = { plotId: plotId(normalized) };
      break;
    }
    case "compare-plots": {
      const ids = comparePlotIds(normalized)!;
      label = `Compare ${plotLabelFromLetter(ids[0])} vs ${plotLabelFromLetter(ids[1])}`;
      params = { plotId: ids[0], secondaryPlotId: ids[1] };
      break;
    }
    case "inspect-plot":
    case "scan-plot":
    case "focus-plot": {
      const verb = match.commandId === "inspect-plot" ? "Inspect" : match.commandId === "scan-plot" ? "Scan" : "Focus";
      label = `${verb} ${plotLabel(normalized)}`;
      params = { plotId: plotId(normalized) };
      break;
    }
    case "locate-drone": {
      const name = locateDroneName(normalized);
      label = name ? `Locate Drone ${capitalize(name)}` : "Locate Drone";
      params = { unitName: name };
      break;
    }
    case "locate-robot": {
      const name = locateRobotName(normalized);
      label = name ? `Locate Robot ${capitalize(name)}` : "Locate Robot";
      params = { unitName: name };
      break;
    }
    case "set-layer": {
      const layer = matchLayer(normalized)!;
      const enabled = /enable/.test(normalized);
      label = `${enabled ? "Enable" : "Disable"} ${layer.label} Layer`;
      params = { layerKey: layer.key, layerEnabled: enabled };
      break;
    }
    case "layer-toggle": {
      // Broader verb vocabulary than `set-layer` ("hide"/"show" in addition
      // to "enable"/"disable") — same underlying capability, so this
      // computes the exact same `params` shape `set-layer` does (the
      // Action Executor's `set-layer` handler runs for both commandIds).
      // Previously computed a label but no `params` at all, which is why
      // this command fell through to the stale placeholder even after
      // being made actionable — there was nothing for the executor to act on.
      const layer = matchLayer(normalized);
      const enabled = /show|enable/.test(normalized);
      const action = /hide/.test(normalized) ? "Hide" : /show/.test(normalized) ? "Show" : /enable/.test(normalized) ? "Enable" : "Disable";
      label = `${action} ${layer?.label ?? "Layer"} Layer`;
      if (layer) params = { layerKey: layer.key, layerEnabled: enabled };
      break;
    }
    case "presentation-mode": {
      const enabled = /start/.test(normalized);
      label = enabled ? "Start Presentation Mode" : "Stop Presentation Mode";
      params = { presentationEnabled: enabled };
      break;
    }
    case "open-page": {
      const target = matchPageTarget(normalized)!;
      label = `Open ${target.label}`;
      params = { pageTarget: target.target };
      break;
    }
    case "generate-report": {
      // No standalone "generate a report from chat" capability exists (or is
      // being added here — see action-executor.ts's own note on this case)
      // — the real Reports feature is a page, not a chat-callable service.
      // Routes to the exact same `open-page` capability "Open Reports"
      // already uses, rather than fabricating an in-chat report.
      label = "Open Reports";
      params = { pageTarget: "reports" };
      break;
    }
    case "create-mission":
    case "create-drone-mission": {
      // "Create a drone mission" was historically kept as a SEPARATE,
      // never-wired stub commandId specifically so its pattern couldn't
      // shadow this one's ("create" + "mission", excluding "drone
      // mission"/"drone flight" phrasing) — see that pattern's own comment
      // above. There's no real difference in what either phrasing should
      // do, so both now compute the identical params and share the Action
      // Executor's one `create-mission` handler.
      const type = matchMissionType(normalized);

      // The genuine zero-signal case: no "drone"/"robot"
      // word AND no recognized mission-type word either (so a phrase like
      // "Create a crop health mission for Plot A" — no vehicle word, but
      // "crop health" IS a recognized type — still defaults to drone
      // exactly as before; only a truly bare "Create a mission for Plot A"
      // is treated as ambiguous). Resolved first by page context
      // (`resolveVehicleKindFromPage`); if that can't decide either, this
      // becomes "clarify-mission-vehicle" instead of silently defaulting to
      // drone — the "Do NOT silently create the wrong mission type"
      // requirement this change adds.
      if (!/\b(robot|drone)\b/.test(normalized) && !type) {
        const resolved = resolveVehicleKindFromPage(context);
        if (resolved === "robot") {
          const robotType = matchRobotMissionType(normalized);
          commandId = "create-robot-mission";
          label = `Create ${robotType?.label ?? "Crop Inspection"} Robot Mission`;
          params = { missionType: robotType?.type ?? "crop-inspection", plotId: plotId(normalized) };
          break;
        }
        if (resolved !== "drone") {
          commandId = "clarify-mission-vehicle";
          label = "Clarify Mission Vehicle";
          params = { ambiguousAction: "create", plotId: plotId(normalized) };
          break;
        }
        // resolved === "drone" — falls through to the normal drone-create
        // logic below, same as if "drone" had been said explicitly.
      }

      label = `Create ${type?.label ?? "Survey"} Mission`;
      params = { missionType: type?.type ?? "survey", plotId: plotId(normalized) };
      break;
    }
    case "assign-drone-to-mission": {
      const name = assignDroneName(normalized);
      label = name ? `Assign Drone ${capitalize(name)}` : "Assign Drone";
      params = { unitName: name };
      break;
    }
    case "start-mission": {
      // "Start the mission" (no "drone"/"robot" word at
      // all) is genuinely ambiguous between the two Mission Stores; "Start
      // the drone mission" (explicit word) is NOT ambiguous and keeps
      // working exactly as before via the normal path below.
      if (!/\b(robot|drone)\b/.test(normalized)) {
        const resolved = resolveVehicleKindFromPage(context);
        if (resolved === "robot") {
          const name = robotMissionNameAfterVerb(normalized, "start");
          commandId = "start-robot-mission";
          label = name ? `Start Robot Mission ${capitalize(name)}` : "Start Robot Mission";
          params = { missionName: name };
          break;
        }
        if (resolved !== "drone") {
          commandId = "clarify-mission-vehicle";
          label = "Clarify Mission Vehicle";
          params = { ambiguousAction: "start" };
          break;
        }
      }
      const name = missionNameAfterVerb(normalized, "start");
      label = name ? `Start Mission ${capitalize(name)}` : "Start Mission";
      params = { missionName: name };
      break;
    }
    case "pause-mission": {
      const name = missionNameAfterVerb(normalized, "pause");
      label = name ? `Pause Mission ${capitalize(name)}` : "Pause Mission";
      // Threaded through even for this drone-labeled command so
      // action-executor.ts's cross-store fallback (see that file's
      // `resolveActiveMissionAcrossStores`) can still find an AURA-dispatched
      // ROBOT mission when no name was given and nothing is selected on the
      // drone side — see that fallback's own doc comment.
      params = { missionName: name, recentMissionRefs: context?.recentMissionRefs };
      break;
    }
    case "resume-mission": {
      const name = missionNameAfterVerb(normalized, "resume");
      label = name ? `Resume Mission ${capitalize(name)}` : "Resume Mission";
      params = { missionName: name, recentMissionRefs: context?.recentMissionRefs };
      break;
    }
    case "cancel-mission": {
      // Same ambiguity treatment as "start-mission"
      // above, now also covering "stop" (Part 4's added synonym).
      if (!/\b(robot|drone)\b/.test(normalized)) {
        const resolved = resolveVehicleKindFromPage(context);
        if (resolved === "robot") {
          const name = robotMissionNameAfterVerb(normalized, "cancel") ?? robotMissionNameAfterVerb(normalized, "stop");
          commandId = "cancel-robot-mission";
          label = name ? `Cancel Robot Mission ${capitalize(name)}` : "Cancel Robot Mission";
          params = { missionName: name, recentMissionRefs: context?.recentMissionRefs };
          break;
        }
        if (resolved !== "drone") {
          commandId = "clarify-mission-vehicle";
          label = "Clarify Mission Vehicle";
          params = { ambiguousAction: "stop" };
          break;
        }
      }
      const name = missionNameAfterVerb(normalized, "cancel") ?? missionNameAfterVerb(normalized, "stop");
      label = name ? `Cancel Mission ${capitalize(name)}` : "Cancel Mission";
      params = { missionName: name, recentMissionRefs: context?.recentMissionRefs };
      break;
    }
    case "delete-mission": {
      const name = missionNameAfterVerb(normalized, "delete");
      label = name ? `Delete Mission ${capitalize(name)}` : "Delete Mission";
      params = { missionName: name };
      break;
    }
    case "duplicate-mission": {
      const name = missionNameAfterVerb(normalized, "duplicate");
      label = name ? `Duplicate Mission ${capitalize(name)}` : "Duplicate Mission";
      params = { missionName: name };
      break;
    }
    case "locate-mission": {
      const name = missionNameAfterVerb(normalized, "locate");
      label = name ? `Locate Mission ${capitalize(name)}` : "Locate Mission";
      params = { missionName: name };
      break;
    }
    case "mission-status": {
      const name = missionNameAfterKeyword(normalized, "status");
      params = { missionName: name };
      break;
    }
    case "mission-progress": {
      const name = missionNameAfterKeyword(normalized, "progress");
      params = { missionName: name };
      break;
    }
    case "mission-eta": {
      const name = missionNameAfterKeyword(normalized, "eta");
      params = { missionName: name };
      break;
    }
    case "mission-battery": {
      const name = missionNameAfterKeyword(normalized, "battery");
      params = { missionName: name };
      break;
    }
    case "create-robot-mission": {
      const type = matchRobotMissionType(normalized);
      label = `Create ${type?.label ?? "Crop Inspection"} Robot Mission`;
      params = { missionType: type?.type ?? "crop-inspection", plotId: plotId(normalized) };
      break;
    }
    case "assign-robot-to-mission": {
      const name = robotNameAfterVerb(normalized, "assign");
      label = name ? `Assign Robot ${capitalize(name)} to Mission` : "Assign Robot to Mission";
      params = { unitName: name };
      break;
    }
    case "start-robot-mission": {
      const name = robotMissionNameAfterVerb(normalized, "start");
      label = name ? `Start Robot Mission ${capitalize(name)}` : "Start Robot Mission";
      params = { missionName: name };
      break;
    }
    case "pause-robot-mission": {
      const name = robotMissionNameAfterVerb(normalized, "pause");
      label = name ? `Pause Robot Mission ${capitalize(name)}` : "Pause Robot Mission";
      params = { missionName: name, recentMissionRefs: context?.recentMissionRefs };
      break;
    }
    case "resume-robot-mission": {
      const name = robotMissionNameAfterVerb(normalized, "resume");
      label = name ? `Resume Robot Mission ${capitalize(name)}` : "Resume Robot Mission";
      params = { missionName: name, recentMissionRefs: context?.recentMissionRefs };
      break;
    }
    case "cancel-robot-mission": {
      const name = robotMissionNameAfterVerb(normalized, "cancel");
      label = name ? `Cancel Robot Mission ${capitalize(name)}` : "Cancel Robot Mission";
      params = { missionName: name, recentMissionRefs: context?.recentMissionRefs };
      break;
    }
    case "delete-robot-mission": {
      const name = robotMissionNameAfterVerb(normalized, "delete");
      label = name ? `Delete Robot Mission ${capitalize(name)}` : "Delete Robot Mission";
      params = { missionName: name };
      break;
    }
    case "duplicate-robot-mission": {
      const name = robotMissionNameAfterVerb(normalized, "duplicate");
      label = name ? `Duplicate Robot Mission ${capitalize(name)}` : "Duplicate Robot Mission";
      params = { missionName: name };
      break;
    }
    case "locate-robot-mission": {
      const name = robotMissionNameAfterVerb(normalized, "locate");
      label = name ? `Locate Robot Mission ${capitalize(name)}` : "Locate Robot Mission";
      params = { missionName: name };
      break;
    }
    case "robot-mission-status": {
      const name = robotMissionNameAfterKeyword(normalized, "status");
      params = { missionName: name };
      break;
    }
    case "robot-mission-progress": {
      const name = robotMissionNameAfterKeyword(normalized, "progress");
      params = { missionName: name };
      break;
    }
    case "robot-mission-eta": {
      const name = robotMissionNameAfterKeyword(normalized, "eta");
      params = { missionName: name };
      break;
    }
    case "robot-mission-battery": {
      const name = robotMissionNameAfterKeyword(normalized, "battery");
      params = { missionName: name };
      break;
    }
    case "pause-robot": {
      const name = robotNameAfterVerb(normalized, "pause");
      label = name ? `Pause Robot ${capitalize(name)}` : "Pause Robot";
      params = { unitName: name };
      break;
    }
    case "resume-robot": {
      const name = robotNameAfterVerb(normalized, "resume");
      label = name ? `Resume Robot ${capitalize(name)}` : "Resume Robot";
      params = { unitName: name };
      break;
    }
    case "send-robot-home": {
      const name = sendRobotHomeName(normalized);
      label = name ? `Send Robot ${capitalize(name)} Home` : "Send Robot Home";
      params = { unitName: name };
      break;
    }
    case "maintenance-mode-robot": {
      const name = maintenanceRobotName(normalized);
      const enabled = !/(disable|stop|exit|off)/.test(normalized);
      label = name
        ? `${enabled ? "Enable" : "Disable"} Maintenance Mode — Robot ${capitalize(name)}`
        : `${enabled ? "Enable" : "Disable"} Maintenance Mode`;
      params = { unitName: name, maintenanceEnabled: enabled };
      break;
    }
    case "assign-robot": {
      const name = robotNameAfterVerb(normalized, "assign");
      label = name ? `Assign Robot ${capitalize(name)}` : "Assign Robot";
      params = { unitName: name };
      break;
    }
    case "robot-status": {
      const name = robotNameAfterKeyword(normalized, "status");
      label = name ? `Robot Status — ${capitalize(name)}` : "Robot Status";
      params = { unitName: name };
      break;
    }
    case "robot-battery": {
      const name = robotNameAfterKeyword(normalized, "battery");
      label = name ? `Robot Battery — ${capitalize(name)}` : "Robot Battery";
      params = { unitName: name };
      break;
    }
    case "robot-location": {
      const name = robotNameAfterKeyword(normalized, "location");
      label = name ? `Robot Location — ${capitalize(name)}` : "Robot Location";
      params = { unitName: name };
      break;
    }
    case "robot-health": {
      const name = robotNameAfterKeyword(normalized, "health");
      label = name ? `Robot Health — ${capitalize(name)}` : "Robot Health";
      params = { unitName: name };
      break;
    }
    case "locate-sensor": {
      const query = sensorQueryAfterVerb(normalized, "locate");
      label = query ? `Locate Sensor — ${capitalize(query)}` : "Locate Sensor";
      params = { unitName: query };
      break;
    }
    case "show-sensor": {
      const query = sensorQueryAfterVerb(normalized, "show");
      label = query ? `Show Sensor — ${capitalize(query)}` : "Show Sensor";
      params = { unitName: query };
      break;
    }
    case "sensor-status": {
      const query = sensorQueryAfterKeyword(normalized, "status");
      label = query ? `Sensor Status — ${capitalize(query)}` : "Sensor Status";
      params = { unitName: query };
      break;
    }
    case "sensor-battery": {
      const query = sensorQueryAfterKeyword(normalized, "battery");
      label = query ? `Sensor Battery — ${capitalize(query)}` : "Sensor Battery";
      params = { unitName: query };
      break;
    }
    case "sensor-reading": {
      const query = sensorQueryAfterKeyword(normalized, "reading");
      label = query ? `Sensor Reading — ${capitalize(query)}` : "Sensor Reading";
      params = { unitName: query };
      break;
    }
    case "sensor-health": {
      const query = sensorQueryAfterKeyword(normalized, "health");
      label = query ? `Sensor Health — ${capitalize(query)}` : "Sensor Health";
      params = { unitName: query };
      break;
    }
    case "compare-sensors": {
      const names = compareSensorNames(normalized);
      label = names ? `Compare ${capitalize(names[0])} vs ${capitalize(names[1])}` : "Compare Sensors";
      params = names ? { unitName: names[0], secondaryUnitName: names[1], timeRangeId: matchTimeRangePhrase(normalized) } : undefined;
      break;
    }
    case "show-heatmap": {
      const query = heatmapQuery(normalized);
      label = query ? `Show ${capitalize(query)} Heatmap` : "Show Heatmap";
      params = { unitName: query };
      break;
    }
    case "sensor-trend": {
      const query = sensorQueryAfterKeyword(normalized, "trend");
      label = query ? `Sensor Trend — ${capitalize(query)}` : "Sensor Trend";
      params = { unitName: query, timeRangeId: matchTimeRangePhrase(normalized) };
      break;
    }
    case "sensor-statistics": {
      const query = sensorQueryAfterKeyword(normalized, "statistics") ?? sensorQueryAfterKeyword(normalized, "stats");
      label = query ? `Sensor Statistics — ${capitalize(query)}` : "Sensor Statistics";
      params = { unitName: query, timeRangeId: matchTimeRangePhrase(normalized) };
      break;
    }
    case "show-soil-moisture-trend":
    case "show-temperature-trend": {
      params = { timeRangeId: matchTimeRangePhrase(normalized) };
      break;
    }

    // Agricultural Reasoning & Sensor-Driven
    // Missions. Every capture below stays pure-text-only, same rule every
    // capture function above already follows — resolving a plot/sensor
    // against real store data happens entirely in the Action Executor.
    case "create-sensor-mission": {
      label = "Create Sensor-Driven Mission";
      params = { plotId: plotId(normalized) };
      break;
    }
    case "plot-recommendation": {
      label = `Recommendation — ${plotLabel(normalized)}`;
      params = { plotId: plotId(normalized) };
      break;
    }
    case "fields-needing-irrigation": {
      label = "Fields Needing Irrigation";
      break;
    }
    case "fields-needing-inspection": {
      label = "Fields Needing Inspection";
      break;
    }
    case "plot-trend": {
      label = `Plot Trend — ${plotLabel(normalized)}`;
      params = { plotId: plotId(normalized), timeRangeId: matchTimeRangePhrase(normalized) };
      break;
    }
    case "request-field-inspection": {
      // an explicit "field/plot <letter>" always wins first, unchanged; only
      // when NONE is present AND the message actually refers back to a field
      // by pronoun does this fall back to the one plot most recently named
      // in this conversation. `context.recentPlotId` is `undefined` whenever
      // no plot has been mentioned recently, or `aura-chat-store.ts` had
      // nothing to look at — the existing "which field?" clarification (or
      // the farm's-only-one-plot auto-resolve) in `handleFieldInspectionRequest`
      // still applies exactly as before whenever this stays unresolved.
      const target = requestedPlotId(normalized) ?? (referencesFieldPronoun(normalized) ? context?.recentPlotId : undefined);
      const letterMatch = normalized.match(FIELD_OR_PLOT_LETTER);
      label = letterMatch ? `Request Inspection — Field ${letterMatch[1]!.toUpperCase()}` : "Request Field Inspection";
      params = {
        requestedPlotId: target,
        reportedProblemKeyword: reportedProblemKeyword(normalized),
        requestedVehicleKind: requestedVehiclePreference(normalized),
        // See `detectMissionIntent`'s own doc comment.
        missionIntent: detectMissionIntent(normalized),
      };
      break;
    }
    case "override-pending-vehicle": {
      // Always resolves to SOMETHING here — the pattern's own test already
      // required `VEHICLE_PREFERENCE.test(text)` to match at all.
      params = { overrideVehicleKind: requestedVehiclePreference(normalized) };
      break;
    }
    // No mission
    // name is ever extractable from these deliberately vehicle/name-free
    // phrasings ("Pause it.", "Stop the robot.", "Resume it.") — resolution
    // happens entirely in action-executor.ts's `resolveActiveMissionAcrossStores`,
    // using `recentMissionRefs` (this conversation's own recently-dispatched
    // missions) and, failing that, a farm-wide single-active-mission check.
    // Never a guess made here — see that function's own doc comment.
    case "pause-active-mission":
    case "resume-active-mission":
    case "cancel-active-mission": {
      params = { recentMissionRefs: context?.recentMissionRefs };
      break;
    }
    default:
      break;
  }

  return { recognized: true, commandId, label, params };
}
