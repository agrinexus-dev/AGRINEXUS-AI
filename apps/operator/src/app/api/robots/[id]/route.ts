import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { deleteRobot, getRobot, updateRobot } from "@/lib/robots/robots-service";
import { COMMUNICATION_TYPES, ROBOT_TYPES } from "@/lib/robots/types";

/** Identical field set to `POST /api/robots`'s own `createRobotSchema` minus `id` (an existing robot's id never changes). Duplicated rather than imported/shared, matching this codebase's existing convention of each route file owning its own schema. */
const updateRobotSchema = z.object({
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
  capabilities: z.object({
    camera: z.boolean(),
    lidar: z.boolean(),
    sprayer: z.boolean(),
    seeder: z.boolean(),
    fertilizer: z.boolean(),
    aiEnabled: z.boolean(),
  }),
});

/** `GET /api/robots/:id` — mirrors `/api/drones/:id`'s GET. */
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
    const robot = await getRobot(farm.id, id);
    if (!robot) {
      return Response.json({ error: "Robot not found." }, { status: 404 });
    }
    return Response.json({ robot });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

/** `DELETE /api/robots/:id` — mirrors `/api/drones/:id`'s DELETE exactly, including the safe-404 rule ("doesn't exist" and "belongs to a different farm" answer identically). */
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
    const deleted = await deleteRobot(farm.id, id);
    if (!deleted) {
      return Response.json({ error: "Robot not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

/** `PATCH /api/robots/:id` — updates identity/config fields, home position included. Same auth/farm-scope/safe-404 conventions as GET/DELETE above. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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

  const parsed = updateRobotSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid robot payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  try {
    const robot = await updateRobot(
      farm.id,
      id,
      parsed.data as typeof parsed.data & { robotType: (typeof ROBOT_TYPES)[number]; communicationType: (typeof COMMUNICATION_TYPES)[number] },
    );
    if (!robot) {
      return Response.json({ error: "Robot not found." }, { status: 404 });
    }
    return Response.json({ robot });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
