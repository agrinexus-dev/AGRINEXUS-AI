import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { getFarmAutonomousState, updateFarmAutonomousState } from "@/lib/farm/farm-settings-service";

/**
 * `GET /api/farm/autonomous` / `PATCH /api/farm/autonomous` — the two
 * global autonomous-behavior toggles, farm-scoped exactly like every other
 * resource in this app. `GET` is called once
 * by `autonomous-behavior.ts`'s `fetchAutonomousState()` whenever any page
 * that needs autonomous behavior mounts (Drone Fleet, Ground Robots,
 * Digital Twin, both Mission Planners); `PATCH` is called by
 * `setDroneAutonomousEnabled`/`setRobotAutonomousEnabled` right after the
 * in-memory flag flips, so the toggle survives a refresh.
 */

const patchSchema = z
  .object({
    droneAutonomousEnabled: z.boolean().optional(),
    robotAutonomousEnabled: z.boolean().optional(),
  })
  .refine((value) => value.droneAutonomousEnabled !== undefined || value.robotAutonomousEnabled !== undefined, {
    message: "At least one of droneAutonomousEnabled/robotAutonomousEnabled must be provided.",
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
    const state = await getFarmAutonomousState(farm.id);
    if (!state) {
      return Response.json({ error: "Farm not found." }, { status: 404 });
    }
    return Response.json(state);
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const state = await updateFarmAutonomousState(farm.id, parsed.data);
    if (!state) {
      return Response.json({ error: "Farm not found." }, { status: 404 });
    }
    return Response.json(state);
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
