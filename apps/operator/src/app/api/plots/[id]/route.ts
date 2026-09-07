import "server-only";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { getPlot } from "@/lib/plots/plots-service";

/** `GET /api/plots/:id`. 404 for both "doesn't exist" and "belongs to a different farm", never distinguishing the two to an unauthorized caller (same pattern as `/api/sensors/:id`). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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
    const plot = await getPlot(farm.id, id);
    if (!plot) {
      return Response.json({ error: "Plot not found." }, { status: 404 });
    }
    return Response.json({ plot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return Response.json({ error: message }, { status: 500 });
  }
}
