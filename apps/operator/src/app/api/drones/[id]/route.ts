import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { deleteDrone, getDrone, updateDrone } from "@/lib/drones/drones-service";
import { CAMERA_TYPES, COMMUNICATION_TYPES, DRONE_TYPES } from "@/lib/fleet/types";

/** Identical field set to `POST /api/drones`'s own `createDroneSchema` minus `id` (an existing drone's id never changes). Duplicated rather than imported/shared, matching this codebase's existing convention of each route file owning its own schema. */
const updateDroneSchema = z.object({
  name: z.string().min(1),
  model: z.string().min(1),
  serialNumber: z.string().min(1),
  droneType: z.enum(DRONE_TYPES as [string, ...string[]]),
  cameraType: z.enum(CAMERA_TYPES as [string, ...string[]]),
  batteryCapacityMah: z.number().positive(),
  maxFlightTimeMinutes: z.number().positive(),
  communicationType: z.enum(COMMUNICATION_TYPES as [string, ...string[]]),
  firmwareVersion: z.string().min(1),
  homeLocation: z.tuple([z.number().finite(), z.number().finite()]),
  color: z.string().min(1),
  notes: z.string(),
});

/**
 * `GET /api/drones/:id` / `DELETE /api/drones/:id` — mirrors
 * `/api/sensors/:id`'s exact conventions. Same safe-404 rule as every other
 * 018x resource — "doesn't exist" and "belongs to a different farm" answer
 * identically.
 */

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
    const drone = await getDrone(farm.id, id);
    if (!drone) {
      return Response.json({ error: "Drone not found." }, { status: 404 });
    }
    return Response.json({ drone });
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
    const deleted = await deleteDrone(farm.id, id);
    if (!deleted) {
      return Response.json({ error: "Drone not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

/** `PATCH /api/drones/:id` — updates identity/config fields, home location included. Same auth/farm-scope/safe-404 conventions as GET/DELETE above. */
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

  const parsed = updateDroneSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid drone payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  try {
    const drone = await updateDrone(
      farm.id,
      id,
      parsed.data as typeof parsed.data & {
        droneType: (typeof DRONE_TYPES)[number];
        cameraType: (typeof CAMERA_TYPES)[number];
        communicationType: (typeof COMMUNICATION_TYPES)[number];
      },
    );
    if (!drone) {
      return Response.json({ error: "Drone not found." }, { status: 404 });
    }
    return Response.json({ drone });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
