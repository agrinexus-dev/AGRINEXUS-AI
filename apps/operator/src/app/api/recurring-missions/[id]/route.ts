import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { deleteRecurringMission, updateRecurringMission } from "@/lib/recurring-missions/recurring-missions-service";

/**
 * `PATCH /api/recurring-missions/:id` (enable/disable, interval change, and
 * the scheduler's own lifecycle writes) / `DELETE /api/recurring-missions/:id`
 * Mirrors `/api/missions/:id`'s conventions.
 */

const updateSchema = z
  .object({
    enabled: z.boolean(),
    intervalMinutes: z.number().int().min(1).max(24 * 60),
    nextRunAt: z.number().nullable(),
    activeRunId: z.string().nullable(),
  })
  .partial();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const farm = await getFarmForSession(session.user as AppSessionUser);
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

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid recurring mission update.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const recurringMission = await updateRecurringMission(farm.id, id, parsed.data);
    if (!recurringMission) {
      return Response.json({ error: "Recurring mission not found." }, { status: 404 });
    }
    return Response.json({ recurringMission });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const farm = await getFarmForSession(session.user as AppSessionUser);
  if (!farm) {
    return Response.json({ error: "No farm is associated with this account." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const deleted = await deleteRecurringMission(farm.id, id);
    if (!deleted) {
      return Response.json({ error: "Recurring mission not found." }, { status: 404 });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
