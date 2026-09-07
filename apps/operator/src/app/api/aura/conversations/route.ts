import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { clearAllConversations, createConversation, listConversations } from "@/lib/aura/conversations/aura-conversations-service";
import { getFarmForSession } from "@/lib/farm/current-farm";

/**
 * `GET /api/aura/conversations` (list) / `POST` (create with a first
 * message) / `DELETE` (clear all — Part 9) — mirrors `/api/findings`'s exact
 * conventions. `userId`/`farmId` are ALWAYS derived from the session
 * (`auth()` + `getFarmForSession`); the client never supplies either, so a
 * request can never list, create against, or clear another user's or
 * another farm's conversations.
 */

const createSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }
  const user = session.user as AppSessionUser;
  const farm = await getFarmForSession(user);
  if (!farm) {
    return Response.json({ error: "No farm is associated with this account." }, { status: 403 });
  }

  try {
    const conversations = await listConversations(user.id, farm.id);
    return Response.json({ conversations });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }
  const user = session.user as AppSessionUser;
  const farm = await getFarmForSession(user);
  if (!farm) {
    return Response.json({ error: "No farm is associated with this account." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid conversation payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const conversation = await createConversation(user.id, farm.id, parsed.data.role, parsed.data.content);
    return Response.json({ conversation }, { status: 201 });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

/** Part 9 — "Clear History." The confirmation dialog lives client-side (`Do not perform the deletion without confirmation`); this endpoint performs the actual deletion once the Farmer has confirmed. */
export async function DELETE(): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }
  const user = session.user as AppSessionUser;
  const farm = await getFarmForSession(user);
  if (!farm) {
    return Response.json({ error: "No farm is associated with this account." }, { status: 403 });
  }

  try {
    const deletedCount = await clearAllConversations(user.id, farm.id);
    return Response.json({ deletedCount });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
