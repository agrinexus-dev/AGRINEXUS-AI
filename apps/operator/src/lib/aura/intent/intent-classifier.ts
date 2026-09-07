import "server-only";

import type { AuraMessage, ProviderId } from "../types";
import { chatWithFallback } from "../providers/chat-router";
import { auraClassifiedIntentSchema, type AuraClassifiedIntent } from "./types";

/**
 * The LLM intent-understanding fallback. Only ever called (see `route.ts`)
 * for a message the deterministic parser did NOT already recognize, and
 * only ever produces
 * the two raw fields described in `types.ts` — never anything the caller
 * would need to trust further than "here's what the model thinks the
 * farmer might mean," re-validated against real farm data by the Action
 * Executor before anything happens.
 *
 * Reuses the EXACT SAME provider/fallback architecture every other AURA
 * request already goes through (`chatWithFallback` — the Groq→
 * OpenRouter→... router) — no second provider system, no provider-specific
 * classification logic.
 *
 * Deliberately a TINY prompt — just the farmer's message, the farm's real
 * plot labels (for grounding "Field A" against what actually exists), and a
 * few recent conversation turns (for pronoun/reference resolution, Parts
 * 15–17) — never the full canonical `AuraContext` a second time (Part 26:
 * "do not unnecessarily duplicate the same farm data into multiple
 * prompts"). The full context is still used exactly once, downstream, by
 * the ordinary conversational path for anything this classifier itself
 * doesn't resolve into an action.
 */

const SYSTEM_PROMPT = `You classify ONE farmer chat message for a farm-management app into a strict JSON object. Reply with ONLY the JSON object — no prose, no markdown fences, no explanation.

Shape (exactly these four fields, no others):
{"isFieldInspectionRequest": boolean, "targetPlotLabel": string|null, "problemKeyword": string|null, "preferredVehicleKind": "robot"|"drone"|null}

Rules:
- isFieldInspectionRequest = true when the farmer wants a field or their crops physically checked, scanned, inspected, or investigated — including problem reports with no explicit "check/inspect" verb ("something is eating my crops", "my wheat doesn't look right", "the leaves are turning yellow"), and including requests to "send someone"/"send a robot or drone" to look at something.
- isFieldInspectionRequest = false for anything else: greetings, pure informational questions, unrelated chat, or a message with no actionable content.
- targetPlotLabel: the field exactly as the farmer referred to it (e.g. "Field A", "the north field"), or — if they used a pronoun/reference like "it"/"there"/"that field" — the field CLEARLY AND RECENTLY named earlier in the conversation below. null if no field can be determined at all (never guess a field that was never mentioned).
- problemKeyword: a short 1-3 word description of the reported problem in the farmer's own terms (e.g. "pests", "yellow leaves", "dry soil", "weeds"), or null if the farmer described no specific problem (a general "check field A").
- preferredVehicleKind: "drone" if the farmer specifically asked for a drone/aerial check ("Can a drone look at Field B?"), "robot" if they specifically asked for a robot/rover/ground unit ("Send the robot", "Send a rover"), or null if they expressed no preference at all (including "use whatever is available" — that phrase means null, not a choice).

Never include any field other than these four. Never wrap the JSON in markdown. Never add commentary.`;

function buildUserPrompt(text: string, plotLabels: string[], recentMessages: { role: string; content: string }[]): string {
  const knownFields = plotLabels.length > 0 ? plotLabels.join(", ") : "(none configured)";
  const history =
    recentMessages.length > 0
      ? recentMessages.map((message) => `${message.role === "user" ? "Farmer" : "AURA"}: ${message.content}`).join("\n")
      : "(no prior messages)";
  return `Real fields on this farm: ${knownFields}\n\nRecent conversation (most recent last):\n${history}\n\nFarmer's new message: "${text}"`;
}

/** Strips a markdown code fence if the model added one despite being told not to — defensive, never assumed necessary. */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
}

/**
 * Never throws — a malformed/unparseable/schema-invalid response is treated
 * the same as "the model didn't recognize this as an inspection request"
 * (returns `null`), so the caller always has a safe, honest fallback (drop
 * straight through to ordinary conversation) rather than a crash or a
 * fabricated action.
 */
export async function classifyFarmerIntent(
  text: string,
  plotLabels: string[],
  recentMessages: AuraMessage[],
  provider: ProviderId,
  model: string,
): Promise<AuraClassifiedIntent | null> {
  const trimmedRecent = recentMessages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-6)
    .map((message) => ({ role: message.role, content: message.content }));

  const messages: AuraMessage[] = [
    { id: "intent-system", role: "system", content: SYSTEM_PROMPT, createdAt: 0 },
    { id: "intent-user", role: "user", content: buildUserPrompt(text, plotLabels, trimmedRecent), createdAt: 0 },
  ];

  let raw: string;
  try {
    const result = await chatWithFallback(provider, model, 0, messages);
    raw = result.content;
  } catch {
    // A genuine provider failure here is NOT reported as an application
    // error to the Farmer — it just means the classification step didn't
    // run; the message still falls through to ordinary conversation, which
    // will itself surface any real provider outage honestly if that path
    // also fails.
    return null;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripCodeFence(raw));
  } catch {
    return null;
  }

  const validated = auraClassifiedIntentSchema.safeParse(parsedJson);
  return validated.success ? validated.data : null;
}
