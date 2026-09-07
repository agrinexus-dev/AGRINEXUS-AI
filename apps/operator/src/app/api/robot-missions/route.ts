import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { createRobotMission, listRobotMissions, type RobotMissionSnapshotInput } from "@/lib/robot-missions/robot-missions-service";
import { ROBOT_MISSION_STATUS_LABELS, ROBOT_MISSION_TYPES } from "@/lib/robot-missions/types";

/**
 * `GET /api/robot-missions` (list) / `POST /api/robot-missions` (create) —
 * Mirrors `/api/missions` exactly (see that route's own doc
 * comment for the full "full snapshot, not recomputed server-side"
 * reasoning).
 */

const positionSchema = z.tuple([z.number().finite(), z.number().finite()]).nullable();

const missionSnapshotSchema = z.object({
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
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  completedAt: z.number().nullable(),
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
    const robotMissions = await listRobotMissions(farm.id);
    return Response.json({ robotMissions });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
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

  const { id, ...rest } = (body ?? {}) as { id?: unknown };
  if (typeof id !== "string" || id.length === 0) {
    return Response.json({ error: "Missing mission id." }, { status: 400 });
  }

  const parsed = missionSnapshotSchema.safeParse(rest);
  if (!parsed.success) {
    return Response.json({ error: "Invalid robot mission payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const mission = await createRobotMission(farm.id, id, parsed.data as RobotMissionSnapshotInput);
    if (!mission) {
      return Response.json({ error: "Target plot or assigned robot doesn't belong to this farm." }, { status: 400 });
    }
    return Response.json({ mission }, { status: 201 });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
