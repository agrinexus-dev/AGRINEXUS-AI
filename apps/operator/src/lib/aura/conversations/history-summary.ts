import type { AuraMessage } from "../types";

/**
 * A deterministic (never LLM-generated) compaction of conversation turns
 * older than the recent window `prompt-builder.ts`'s `buildMessagesForProvider`
 * sends verbatim. Deliberately NOT a second AI call summarizing the
 * transcript: that would add latency/cost of its own and, worse, a real
 * hallucination risk (a summarizer can misstate what a mission actually
 * did) in exactly the system this whole project has worked hardest to keep
 * honest. Instead this only ever surfaces things literally present in the
 * folded messages — a real plot-label mention, a real line from AURA's own
 * action-executor reply — so it can never invent a decision that wasn't
 * actually made.
 *
 * This never removes information from the conversation store itself (see
 * `aura-chat-store.ts` — nothing here mutates `messages`); it only affects
 * what a SINGLE provider request includes for turns outside the recent
 * window.
 */

const MAX_ACTION_LINES = 6;
const MAX_QA_PAIRS = 4;
const MAX_LINE_LENGTH = 160;

/**
 * Matches the characteristic phrasing of AURA's own real action-executor
 * replies (`action-executor.ts`'s dispatch/confirm/cancel/pause/resume
 * messages) — never a guess at "this message sounds important," only the
 * actual, fixed vocabulary that system already uses for a real outcome.
 */
const ACTION_KEYWORDS =
  /\b(mission (created|started|confirmed|completed|cancelled|paused|resumed)|is (now )?(on its way|inspecting|patrolling|working)|I can send|would you like me to send|dispatching|dispatched|has been (paused|resumed|cancelled)|I don't have a pending mission)\b/i;

/**
 * Added this change to close a real
 * gap found on code review: the original summarizer above only ever
 * extracted plot-label mentions and action-executor lines, so a long
 * disease/pest-diagnosis conversation aging past `MAX_RECENT_MESSAGES`
 * could lose exactly the crop/field/growth-stage facts Part 15's own worked
 * example worries about ("must not reduce this to: 'User asked about
 * tomato disease'"). Rather than trying to re-derive structured facts
 * (there is no stored crop-type field anywhere in this schema — see
 * `prompt-builder.ts`'s `FIELD_DATA_CORRELATION` doc comment — so a crop
 * name only ever exists as free text a farmer typed), this identifies the
 * real assistant question that asked for exactly this kind of
 * confirmation and quotes the farmer's own real next reply verbatim
 * (truncated) — the same "extract what's literally there, never
 * synthesize" discipline as `ACTION_KEYWORDS` above, just widened to cover
 * field-diagnosis dialogue instead of only mission dialogue. Because both
 * sides of the pair are real quoted text, a KNOWN fact the farmer actually
 * stated can never be silently reworded into an INFERENCE (or the reverse)
 * by this change — Part 16's own requirement.
 */
const DIAGNOSTIC_KEYWORDS =
  /\b(disease|pest|infestation|fungal|bacterial|viral|lesion|leaf spot|blight|wilt|mold|mildew|rot|deficiency|infection|symptom)\b/i;

const FIELD_CONTEXT_QUESTION_KEYWORDS =
  /\b(which (field|plot)|what crop|what('| i)?s the crop|is this (same problem|happening|occurring) in (your|any of your) field|which of your fields|growth stage)\b/i;

function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

/**
 * @param older Every message older than the recent verbatim window (see
 *  `buildMessagesForProvider`'s own `MAX_RECENT_MESSAGES` split) — never
 *  the full conversation.
 * @param knownPlotLabels The farm's real plot labels (`AuraContext.plots`)
 *  — used only to detect which fields were actually named earlier, never
 *  to invent one.
 * @returns `null` when there's nothing worth surfacing (e.g. the folded
 *  turns were all small talk with no field mention and no real action).
 */
export function summarizeOlderMessages(older: AuraMessage[], knownPlotLabels: string[]): string | null {
  if (older.length === 0) return null;

  const mentionedPlots = knownPlotLabels.filter((label) =>
    older.some((message) => message.content.toLowerCase().includes(label.toLowerCase())),
  );

  const actionLines: string[] = [];
  for (const message of older) {
    if (message.role !== "assistant") continue;
    if (!ACTION_KEYWORDS.test(message.content)) continue;
    actionLines.push(truncate(message.content, MAX_LINE_LENGTH));
    if (actionLines.length >= MAX_ACTION_LINES) break;
  }

  // Part 12/15 — real diagnostic statements AURA made earlier (e.g. "leaf
  // spot, consistent with a fungal infection"), quoted verbatim/truncated,
  // never reworded — so the conversation's actual disease/pest conclusion
  // survives even once the turn that stated it ages out of the recent
  // window.
  const diagnosisLines: string[] = [];
  for (const message of older) {
    if (message.role !== "assistant") continue;
    if (!DIAGNOSTIC_KEYWORDS.test(message.content)) continue;
    diagnosisLines.push(truncate(message.content, MAX_LINE_LENGTH));
    if (diagnosisLines.length >= MAX_ACTION_LINES) break;
  }

  // Part 15/16 — a real assistant question that asked the farmer to
  // confirm field/crop/growth-stage context, paired with the farmer's own
  // actual next reply. Both halves are quoted exactly as typed/generated —
  // this can never invent a crop or field the farmer didn't actually name.
  const confirmedContextPairs: string[] = [];
  for (let i = 0; i < older.length - 1; i++) {
    const question = older[i];
    const answer = older[i + 1];
    if (!question || !answer) continue;
    if (question.role !== "assistant" || answer.role !== "user") continue;
    if (!FIELD_CONTEXT_QUESTION_KEYWORDS.test(question.content)) continue;
    confirmedContextPairs.push(
      `AURA asked: "${truncate(question.content, MAX_LINE_LENGTH)}" — Farmer answered: "${truncate(answer.content, MAX_LINE_LENGTH)}"`,
    );
    if (confirmedContextPairs.length >= MAX_QA_PAIRS) break;
  }

  const userTurnCount = older.filter((message) => message.role === "user").length;
  if (userTurnCount === 0) return null;

  const parts: string[] = [
    `${userTurnCount} earlier farmer message${userTurnCount === 1 ? "" : "s"} in this conversation ${userTurnCount === 1 ? "was" : "were"} folded out of the raw transcript below to keep this request a reasonable size — this summary is a real, compact record of them, not verbatim quotes.`,
  ];
  if (mentionedPlots.length > 0) {
    parts.push(`Fields discussed earlier in this conversation: ${mentionedPlots.join(", ")}.`);
  }
  if (diagnosisLines.length > 0) {
    parts.push(`Diagnostic observations AURA made earlier in this conversation:\n- ${diagnosisLines.join("\n- ")}`);
  }
  if (confirmedContextPairs.length > 0) {
    parts.push(`Field/crop context confirmed earlier in this conversation:\n- ${confirmedContextPairs.join("\n- ")}`);
  }
  if (actionLines.length > 0) {
    parts.push(`Actions/proposals AURA made earlier in this conversation:\n- ${actionLines.join("\n- ")}`);
  }
  return parts.join(" ");
}
