import { z } from "zod";

/**
 * AURA Intelligence phase, Parts 2–5 — the canonical structured intent the
 * LLM classifier fallback may produce, deliberately small and narrow (a
 * SINGLE recognized operation — "the farmer wants a field looked at" —
 * rather than a general-purpose action schema): every field here is
 * UNTRUSTED, LLM-produced text that the Action Executor re-validates
 * against real farm data before anything happens. `.strict()`
 * rejects any extra field the model might add — "do not allow arbitrary
 * fields to become executable commands" (Part 3/29 #13/16/20) means a
 * response with an unexpected shape fails validation outright rather than
 * silently accepting whatever came back.
 *
 * Deliberately does NOT include `needsClarification`/a clarification
 * question, WHICH vehicle to actually use, or a mission type: the
 * existing `handleFieldInspectionRequest` ALREADY owns all of that
 * decision-making deterministically (ambiguous-field clarification,
 * capability mapping, availability, mission-aware duplicate checking) —
 * duplicating any of it into the LLM's own output would be exactly the
 * "second, competing decision system" every prior phase's own architecture
 * rules forbid. The classifier's only job is turning free-form language
 * into the same raw inputs the deterministic parser already extracts for
 * an explicit "check field A": which field (if any, as the farmer referred
 * to it), what problem (if any) they described, and
 * whether they EXPRESSED a preference for a specific vehicle KIND (not
 * which specific unit; that's still the executor's own availability-driven
 * choice).
 */
export const auraClassifiedIntentSchema = z
  .object({
    isFieldInspectionRequest: z.boolean(),
    targetPlotLabel: z.string().trim().min(1).max(40).nullable(),
    problemKeyword: z.string().trim().min(1).max(40).nullable(),
    preferredVehicleKind: z.enum(["robot", "drone"]).nullable(),
  })
  .strict();

export type AuraClassifiedIntent = z.infer<typeof auraClassifiedIntentSchema>;
