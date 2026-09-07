import "server-only";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { resolveAlert } from "@/lib/alerts/alerts-service";
import { getFarmForSession } from "@/lib/farm/current-farm";

/**
 * `POST /api/alerts/:id/resolve` — the only mutation the
 * existing Alerts UI actually needs beyond create (there's no edit/delete
 * anywhere in `alerts-page.tsx` or `alert-store.ts` today, so none is added
 * here — Part 4's own instruction: "do not create unnecessary CRUD
 * operations simply for completeness").
 *
 * Returns 404 for BOTH "no such alert" and "that alert belongs to a
 * different farm" — `alerts-service.ts`'s `resolveAlert` already collapses
 * those two cases into one `null` return specifically so this route can't
 * leak which one it was to an unauthorized caller.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const farm = await getFarmForSession(session.user as AppSessionUser);
  if (!farm) {
    return Response.json({ error: "No farm is associated with this account." }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: "Missing alert id." }, { status: 400 });
  }

  try {
    const alert = await resolveAlert(farm.id, id);
    if (!alert) {
      return Response.json({ error: "Alert not found." }, { status: 404 });
    }
    return Response.json({ alert });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return Response.json({ error: message }, { status: 500 });
  }
}
