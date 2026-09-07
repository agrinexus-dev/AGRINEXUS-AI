import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { getFarmLocation, updateFarmLocation } from "@/lib/farm/farm-location-service";

/**
 * `GET /api/farm/location` / `PATCH /api/farm/location` —
 * mirrors `/api/farm/autonomous`'s exact shape: farm-scoped from the
 * authenticated session only, never from a client-supplied farmId (there
 * is no farmId anywhere in this route's request handling at all — the
 * session IS the authorization). `GET` is used by the Weather page to show
 * the currently-saved location before/alongside opening the map; `PATCH` is
 * called once the operator confirms a new point on the map.
 *
 * Deliberately a SEPARATE route from `/api/weather` — location is a farm
 * SETTING (write-rare, like the autonomous toggles), weather is DATA
 * (read-only, derived from that setting) — same separation-of-concerns
 * `/api/farm/autonomous` vs the various read-only fleet/sensor routes
 * already established.
 */

// z.number() already rejects NaN; `.finite()` additionally rejects
// +/-Infinity — together these satisfy Part 4's "Reject NaN, Infinity,
// malformed values" requirement before the range check even runs.
const patchSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

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
    const location = await getFarmLocation(farm.id);
    return Response.json({ location });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const farm = await getFarmForSession(session.user as AppSessionUser);
  if (!farm) {
    return Response.json({ error: "No farm is associated with this account." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Part 12 — even if a malicious/buggy client included a `farmId` field in
  // the body, `patchSchema` doesn't recognize it and `updateFarmLocation`
  // below is called with `farm.id` (session-derived) only; nothing in this
  // route ever reads a farmId out of `body`.
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid location.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const location = await updateFarmLocation(farm.id, parsed.data);
    if (!location) {
      return Response.json({ error: "Farm not found." }, { status: 404 });
    }
    return Response.json({ location });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
