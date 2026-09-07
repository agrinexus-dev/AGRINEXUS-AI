import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { classifyFarmerIntent } from "@/lib/aura/intent/intent-classifier";
import { PROVIDER_IDS } from "@/lib/aura/types";

/**
 * `POST /api/aura/intent` — AURA Intelligence phase, Parts 2–5. A small,
 * purpose-specific endpoint alongside the existing `/api/aura/chat` and
 * `/api/aura/status` routes (same convention, not a second chat system):
 * classifies ONE farmer message into the narrow structured intent
 * `lib/aura/intent/types.ts` defines, using the exact same provider/
 * fallback architecture `/api/aura/chat` already uses.
 *
 * Authenticated (Part 28/29 — every AURA request, informational or not,
 * requires a real session) but does not itself touch any farm-scoped data:
 * `plotLabels` is advisory grounding text the client already fetched from
 * its own farm-scoped Plot Store, and the classifier's OUTPUT is treated as
 * fully untrusted, re-validated against real Plot Store data by the Action
 * Executor before anything can happen (see that file's own doc comment) —
 * exactly like any other client-supplied input, per Part 3. A farmer could
 * send fabricated plot labels here and the worst outcome is a
 * classification that then fails real-plot validation downstream and
 * produces an honest "I don't see a field matching that" — never a
 * cross-farm data leak or an unauthorized action.
 */

const requestSchema = z.object({
  text: z.string().min(1).max(2000),
  plotLabels: z.array(z.string().max(100)).max(50),
  recentMessages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(8000),
        createdAt: z.number(),
      }),
    )
    .max(20),
  provider: z.enum(PROVIDER_IDS),
  model: z.string().min(1).max(200),
});

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid intent-classification payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const intent = await classifyFarmerIntent(
      parsed.data.text,
      parsed.data.plotLabels,
      parsed.data.recentMessages,
      parsed.data.provider,
      parsed.data.model,
    );
    return Response.json({ intent });
  } catch (error) {
    // Never a 500 that looks like an application defect for what's really a
    // best-effort classification step — but still surface it honestly
    // rather than pretending it succeeded.
    return Response.json({ intent: null, error: error instanceof Error ? error.message : "Intent classification failed." });
  }
}
