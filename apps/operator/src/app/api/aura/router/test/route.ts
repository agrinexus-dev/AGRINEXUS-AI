import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { hasAnyRole, OPERATOR_APP_ROLES } from "@/lib/auth/roles";
import type { AppSessionUser } from "@/lib/auth/types";
import { classifyContextNeeds } from "@/lib/aura/context/context-selector";
import { buildMessagesForProvider } from "@/lib/aura/prompt/prompt-builder";
import { newRequestId, routeAURARequest, synthesizeSpeechRequest, transcribeAudio } from "@/lib/aura/router/aura-router";
import { AuraRouterAllFailedError } from "@/lib/aura/router/types";
import { classifyTaskCategory } from "@/lib/aura/routing/task-router";
import type { AuraContext } from "@/lib/aura/types";

/**
 * `POST /api/aura/router/test` — the Operator-only Router Test panel.
 * Operator/Admin only, re-checked here
 * (see `router/endpoints/route.ts`'s own doc comment for why).
 *
 * Mirrors `/api/aura/chat/route.ts`'s EXISTING pattern exactly (client
 * collects real `AuraContext` via `useCollectAuraContext()`, POSTs it,
 * server builds the canonical prompt) — Part 9's "context is prepared
 * BEFORE routing, never regenerated per-provider" applies here identically:
 * `buildMessagesForProvider` (context-selection + history-window/
 * mission-cap logic, UNCHANGED) runs exactly once, and the
 * resulting `AuraMessage[]` is the ONE canonical payload every endpoint in
 * the chain (automatic OR the single manually-selected one) receives.
 *
 * This route is a genuinely NEW capability (Operator benchmarking), not a
 * replacement for the Farmer/Operator conversational `/api/aura/chat`
 * path — that route still uses the proven `chat-router.ts` fallback chain
 * unchanged this change (
 * section for why wiring the new router into the live conversational path
 * is deferred to a future phase).
 */
function isOperatorOrAdmin(user: AppSessionUser | undefined): boolean {
  return Boolean(user && hasAnyRole(user.roles ?? [user.role], OPERATOR_APP_ROLES));
}

const requestSchema = z.object({
  message: z.string().min(1).optional(),
  context: z.custom<AuraContext>((value) => typeof value === "object" && value !== null).optional(),
  temperature: z.number().min(0).max(1).default(0.3),
  // The Operator
  // test panel's own capability selector. For `text`/`image`,
  // governs ONLY which routing chain is consulted (a real image attachment
  // still isn't tested here — Part 28's "no Farmer image upload" scope
  // limit is about the FARMER experience, unrelated to this Operator-only
  // route, and pre-existing image-content testing is out of scope for this
  // this route's changes). `speech_to_text`/
  // `text_to_speech` are now genuinely, minimally testable end-to-end
  // (real audio in, real audio out), not just routing-selection dry runs,
  // using a small `audio`/`message` payload — never a full benchmark
  // suite ("small diagnostic requests, do not burn quota").
  capability: z.enum(["text", "image", "speech_to_text", "text_to_speech"]).default("text"),
  mode: z.enum(["automatic", "manual"]),
  endpointId: z.string().optional(),
  /** Required only when `capability === "speech_to_text"` — a small real audio clip, base64-encoded. */
  audio: z.object({ mimeType: z.string(), dataBase64: z.string() }).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!isOperatorOrAdmin(session?.user as AppSessionUser | undefined)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.mode === "manual" && !body.endpointId) {
    return Response.json({ error: "Manual mode requires an endpointId." }, { status: 400 });
  }

  try {
    if (body.capability === "speech_to_text") {
      if (!body.audio) return Response.json({ error: "speech_to_text requires an audio clip." }, { status: 400 });
      const result = await transcribeAudio(body.audio, body.mode === "manual" ? { manualEndpointId: body.endpointId } : {});
      return Response.json({ status: "success" as const, kind: "speech_to_text" as const, result });
    }

    if (body.capability === "text_to_speech") {
      if (!body.message) return Response.json({ error: "text_to_speech requires a message to synthesize." }, { status: 400 });
      const result = await synthesizeSpeechRequest(body.message, body.mode === "manual" ? { manualEndpointId: body.endpointId } : {});
      return Response.json({ status: "success" as const, kind: "text_to_speech" as const, result });
    }

    if (!body.message || !body.context) {
      return Response.json({ error: "text/image tests require a message and context." }, { status: 400 });
    }

    // Same server-derived classification `/api/aura/chat/route.ts` already
    // uses — never trusts a client-supplied flag for either.
    const category = classifyTaskCategory(body.message);
    const contextNeeds = classifyContextNeeds(body.message, body.context);
    const messages = buildMessagesForProvider(
      [{ id: "test-user-message", role: "user", content: body.message, createdAt: Date.now() }],
      body.context,
      { includeFullMissionHistory: category === "history_query", contextNeeds },
    );

    const result = await routeAURARequest(
      { messages, temperature: body.temperature, capability: body.capability, requestId: newRequestId() },
      body.mode === "manual" ? { manualEndpointId: body.endpointId } : {},
    );
    return Response.json({ status: "success" as const, kind: body.capability, result });
  } catch (error) {
    if (error instanceof AuraRouterAllFailedError) {
      return Response.json({ status: "failure" as const, message: error.message, attempts: error.attempts });
    }
    return Response.json({ error: "Unexpected router error." }, { status: 500 });
  }
}
