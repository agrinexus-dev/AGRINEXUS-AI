import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { createMission, listMissions, type MissionSnapshotInput } from "@/lib/missions/missions-service";
import { MISSION_STATUS_LABELS, MISSION_TYPES } from "@/lib/missions/types";

/**
 * `GET /api/missions` (list) / `POST /api/missions` (create),
 * mirroring `/api/sensors`'s conventions. The body is a FULL mission snapshot
 * (matches `MissionRecord` minus `id`) — the Mission Store already computes
 * the complete "queued, no waypoints yet" record locally via
 * `buildNewMissionRecord`; this endpoint persists that same snapshot rather
 * than recomputing defaults server-side, so client and server never
 * disagree about what "a freshly created mission" looks like.
 */

const positionSchema = z.tuple([z.number().finite(), z.number().finite()]).nullable();

const missionSnapshotSchema = z.object({
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
    const missions = await listMissions(farm.id);
    return Response.json({ missions });
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
    return Response.json({ error: "Invalid mission payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const mission = await createMission(farm.id, id, parsed.data as MissionSnapshotInput);
    if (!mission) {
      return Response.json({ error: "Target plot or assigned drone doesn't belong to this farm." }, { status: 400 });
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
