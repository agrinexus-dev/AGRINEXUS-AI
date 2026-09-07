import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { appendMessage } from "@/lib/aura/conversations/aura-conversations-service";
import { getFarmForSession } from "@/lib/farm/current-farm";

/**
 * `POST /api/aura/conversations/:id/messages` — appends one message
 * (Farmer's or AURA's) to an EXISTING conversation. The conversation's own
 * first message is created together with the conversation itself (see
 * `POST /api/aura/conversations`) — this route is for every message after
 * that ("Continue the conversation normally").
 */

const appendSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  // T7 (persistence latency). Generation
  // (`/api/aura/chat`) and persistence (this route) are genuinely two
  // separate HTTP requests — the client (`farmer-aura-page.tsx`'s
  // `sendAndPersist`) calls this route only AFTER the assistant's full
  // reply has already streamed/returned — so persistence latency can only
  // be measured as its own real, standalone quantity (request received →
  // row written), never derived or estimated from the generation request's
  // own timestamps. That's an honest measurement of exactly what this route
  // does, not a fabricated slice of a cross-request timeline.
  const persistT0 = Date.now();
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }
  const user = session.user as AppSessionUser;
  const farm = await getFarmForSession(user);
  if (!farm) {
    return Response.json({ error: "No farm is associated with this account." }, { status: 403 });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = appendSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid message payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const message = await appendMessage(user.id, farm.id, id, parsed.data.role, parsed.data.content);
    if (!message) {
      logPersistenceLatency(parsed.data.role, false, Date.now() - persistT0);
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }
    logPersistenceLatency(parsed.data.role, true, Date.now() - persistT0);
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    logPersistenceLatency(parsed.data.role, false, Date.now() - persistT0);
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

/**
 * Server-side-only diagnostic (never
 * returned to the client), matching the exact convention already
 * established in `/api/aura/chat/route.ts`'s `logLatency`. `role` doubles as
 * the "is this the assistant turn actually completing persistence" signal
 * Part 4/5 care about ("do not mark an assistant response persisted until
 * it actually is") — logged here at the one place that outcome is actually
 * known to be true.
 */
function logPersistenceLatency(role: "user" | "assistant", success: boolean, elapsedMs: number): void {
  console.info(`[AURA][latency] persistence role=${role} success=${success ? "yes" : "no"} elapsedMs=${elapsedMs}`);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
