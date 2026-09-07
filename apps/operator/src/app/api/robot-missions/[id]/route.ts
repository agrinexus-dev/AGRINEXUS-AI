import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { deleteRobotMission, getRobotMission, updateRobotMission } from "@/lib/robot-missions/robot-missions-service";
import { ROBOT_MISSION_STATUS_LABELS, ROBOT_MISSION_TYPES } from "@/lib/robot-missions/types";

/**
 * `GET /api/robot-missions/:id` / `PATCH /api/robot-missions/:id` / `DELETE
 * /api/robot-missions/:id` — mirrors `/api/missions/:id`
 * exactly.
 */

const positionSchema = z.tuple([z.number().finite(), z.number().finite()]).nullable();

const missionUpdateSchema = z
  .object({
    name: z.string().min(1),
    missionType: z.enum(ROBOT_MISSION_TYPES as [string, ...string[]]),
    targetPlotId: z.string().nullable(),
    assignedRobotId: z.string().nullable(),
    status: z.enum(Object.keys(ROBOT_MISSION_STATUS_LABELS) as [string, ...string[]]),
    speedMps: z.number(),
    pathSpacingPercent: z.number(),
    homePosition: positionSchema,
    startPosition: positionSchema,
    returnPosition: positionSchema,
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
    const mission = await getRobotMission(farm.id, id);
    if (!mission) {
      return Response.json({ error: "Robot mission not found." }, { status: 404 });
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
    return Response.json({ error: "Invalid robot mission payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mission = await updateRobotMission(farm.id, id, parsed.data as any);
    if (!mission) {
      return Response.json({ error: "Robot mission not found, or the target plot/robot doesn't belong to this farm." }, { status: 404 });
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
    const deleted = await deleteRobotMission(farm.id, id);
    if (!deleted) {
      return Response.json({ error: "Robot mission not found." }, { status: 404 });
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
