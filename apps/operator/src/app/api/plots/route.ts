import "server-only";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { listPlots } from "@/lib/plots/plots-service";

/**
 * `GET /api/plots` — mirrors `/api/alerts`/`/api/sensors`'s
 * exact conventions. Read-only (no POST/PATCH/DELETE) — see
 * `plots-service.ts`'s own doc comment for why.
 */
export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const farm = await getFarmForSession(session.user as AppSessionUser);
  if (!farm) {
    return Response.json({ error: "No farm is associated with this account." }, { status: 403 });
  }

  try {
    const plots = await listPlots(farm.id);
    return Response.json({ plots });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
