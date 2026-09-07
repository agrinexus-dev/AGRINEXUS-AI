import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { createDrone, listDrones } from "@/lib/drones/drones-service";
import { CAMERA_TYPES, COMMUNICATION_TYPES, DRONE_TYPES } from "@/lib/fleet/types";

/**
 * `GET /api/drones` (list) / `POST /api/drones` (create),
 * mirroring `/api/sensors`'s exact conventions. Identity/config fields
 * only — see `drones-service.ts`'s own doc comment for why live telemetry
 * isn't part of this payload.
 */

const createDroneSchema = z.object({
  id: z.string().min(1),
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
    const drones = await listDrones(farm.id);
    return Response.json({ drones });
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

  const parsed = createDroneSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid drone payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { id, ...input } = parsed.data;
    const drone = await createDrone(
      farm.id,
      id,
      input as typeof input & { droneType: (typeof DRONE_TYPES)[number]; cameraType: (typeof CAMERA_TYPES)[number]; communicationType: (typeof COMMUNICATION_TYPES)[number] },
    );
    return Response.json({ drone }, { status: 201 });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
