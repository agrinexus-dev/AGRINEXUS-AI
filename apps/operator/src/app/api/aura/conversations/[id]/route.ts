import "server-only";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { deleteConversation, getConversation } from "@/lib/aura/conversations/aura-conversations-service";
import { getFarmForSession } from "@/lib/farm/current-farm";

/**
 * `GET /api/aura/conversations/:id` (Part 7 — open a previous conversation)
 * / `DELETE /api/aura/conversations/:id` (Part 8 — delete one conversation).
 * `userId`/`farmId` are always session-derived; `getConversation`/
 * `deleteConversation` filter by BOTH, so `:id` alone can never leak or
 * delete another user's conversation even if guessed (404, not 403 — never
 * confirms the id exists at all).
 */

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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
  try {
    const conversation = await getConversation(user.id, farm.id, id);
    if (!conversation) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }
    return Response.json({ conversation });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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
  try {
    const deleted = await deleteConversation(user.id, farm.id, id);
    if (!deleted) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
