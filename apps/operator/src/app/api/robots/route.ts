import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { createRobot, listRobots } from "@/lib/robots/robots-service";
import { COMMUNICATION_TYPES, ROBOT_TYPES } from "@/lib/robots/types";

/**
 * `GET /api/robots` (list) / `POST /api/robots` (create),
 * mirroring `/api/drones`'s exact conventions. No DELETE — audited the
 * existing UI ("only implement operations actually required")
 * and found no "Remove Robot" surface anywhere (unlike Drone's real
 * `removeDrone` button on `drone-fleet-page.tsx`).
 */

const capabilitiesSchema = z.object({
  camera: z.boolean(),
  lidar: z.boolean(),
  sprayer: z.boolean(),
  seeder: z.boolean(),
  fertilizer: z.boolean(),
  aiEnabled: z.boolean(),
});

const createRobotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  model: z.string().min(1),
  manufacturer: z.string().min(1),
  robotType: z.enum(ROBOT_TYPES as [string, ...string[]]),
  color: z.string().min(1),
  maxSpeedMps: z.number().positive(),
  batteryCapacityMah: z.number().positive(),
  maxRuntimeMinutes: z.number().positive(),
  communicationType: z.enum(COMMUNICATION_TYPES as [string, ...string[]]),
  homePosition: z.tuple([z.number().finite(), z.number().finite()]),
  notes: z.string(),
  capabilities: capabilitiesSchema,
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
    const robots = await listRobots(farm.id);
    return Response.json({ robots });
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

  const parsed = createRobotSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid robot payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { id, ...input } = parsed.data;
    const robot = await createRobot(
      farm.id,
      id,
      input as typeof input & { robotType: (typeof ROBOT_TYPES)[number]; communicationType: (typeof COMMUNICATION_TYPES)[number] },
    );
    return Response.json({ robot }, { status: 201 });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
