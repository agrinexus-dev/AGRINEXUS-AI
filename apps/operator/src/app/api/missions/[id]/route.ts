import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { deleteMission, getMission, updateMission } from "@/lib/missions/missions-service";
import { MISSION_STATUS_LABELS, MISSION_TYPES } from "@/lib/missions/types";

/**
 * `GET /api/missions/:id` / `PATCH /api/missions/:id` (partial lifecycle
 * snapshot) / `DELETE /api/missions/:id` — mirrors
 * `/api/sensors/:id`'s conventions. DELETE exists because the Mission
 * Inspector's "Delete" button genuinely calls `deleteMission` today.
 */

const positionSchema = z.tuple([z.number().finite(), z.number().finite()]).nullable();

const missionUpdateSchema = z
  .object({
    name: z.string().min(1),
    missionType: z.enum(MISSION_TYPES as [string, ...string[]]),
    targetPlotId: z.string().nullable(),
    assignedDroneId: z.string().nullable(),
    status: z.enum(Object.keys(MISSION_STATUS_LABELS) as [string, ...string[]]),
    altitude: z.number(),
    speedMps: z.number(),
    sideOverlapPercent: z.number(),
    frontOverlapPercent: z.number(),
    homePosition: positionSchema,
    takeoffPosition: positionSchema,
    landingPosition: positionSchema,
    waypoints: z.array(z.unknown()),
    estimate: z.unknown().nullable(),
    progressPercent: z.number(),
    coverageProgressPercent: z.number(),
    currentWaypointIndex: z.number(),
    headingDegrees: z.number().nullable(),
    batteryAtStartPercent: z.number().nullable(),
    sensorJustification: z.unknown().nullable(),
    recurringConfigId: z.string().nullable(),
    startedAt: z.number().nullable(),
    completedAt: z.number().nullable(),
  })
  .partial();

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
    const mission = await getMission(farm.id, id);
    if (!mission) {
      return Response.json({ error: "Mission not found." }, { status: 404 });
    }
    return Response.json({ mission });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

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

  const parsed = missionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid mission payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mission = await updateMission(farm.id, id, parsed.data as any);
    if (!mission) {
      return Response.json({ error: "Mission not found, or the target plot/drone doesn't belong to this farm." }, { status: 404 });
    }
    return Response.json({ mission });
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
    const deleted = await deleteMission(farm.id, id);
    if (!deleted) {
      return Response.json({ error: "Mission not found." }, { status: 404 });
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
