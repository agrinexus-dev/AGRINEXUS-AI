import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { MISSION_TYPES } from "@/lib/missions/types";
import { createRecurringMission, listRecurringMissions } from "@/lib/recurring-missions/recurring-missions-service";
import { ROBOT_MISSION_TYPES } from "@/lib/robot-missions/types";

/**
 * `GET /api/recurring-missions` (list) / `POST /api/recurring-missions`
 * (create) — mirrors `/api/missions`'s conventions exactly.
 * Ownership is ALWAYS derived from the session, never trusted from the
 * client.
 */

const createSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    vehicleKind: z.enum(["drone", "robot"]),
    droneMissionType: z.enum(MISSION_TYPES as [string, ...string[]]).nullable(),
    robotMissionType: z.enum(ROBOT_MISSION_TYPES as [string, ...string[]]).nullable(),
    targetPlotId: z.string().nullable(),
    assignedDroneId: z.string().nullable(),
    assignedRobotId: z.string().nullable(),
    intervalMinutes: z.number().int().min(1).max(24 * 60),
    enabled: z.boolean(),
    nextRunAt: z.number().nullable(),
  })
  .refine((data) => (data.vehicleKind === "drone" ? data.droneMissionType !== null : data.robotMissionType !== null), {
    message: "The mission type matching vehicleKind must be set.",
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
    const recurringMissions = await listRecurringMissions(farm.id);
    return Response.json({ recurringMissions });
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid recurring mission payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recurringMission = await createRecurringMission(farm.id, parsed.data as any);
    if (!recurringMission) {
      return Response.json({ error: "Target plot/drone/robot doesn't belong to this farm." }, { status: 400 });
    }
    return Response.json({ recurringMission }, { status: 201 });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
