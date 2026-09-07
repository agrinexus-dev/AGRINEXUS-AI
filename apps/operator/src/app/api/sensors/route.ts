import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { COMMUNICATION_TYPES, SENSOR_TYPES } from "@/lib/sensors/types";
import { createSensor, listSensors } from "@/lib/sensors/sensors-service";

/**
 * `GET /api/sensors` (list) / `POST /api/sensors` (create),
 * mirroring `/api/alerts`'s exact conventions: `auth()`
 * first, ownership derived from the session via `getFarmForSession` (never
 * from client input), a consistent `{ error }` shape.
 */

const createSensorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sensorType: z.enum(SENSOR_TYPES as [string, ...string[]]),
  serialNumber: z.string().min(1),
  position: z.tuple([z.number().finite(), z.number().finite()]),
  assignedPlotId: z.string().nullable(),
  communicationType: z.enum(COMMUNICATION_TYPES as [string, ...string[]]),
  batteryCapacityMah: z.number().positive(),
  samplingIntervalSeconds: z.number().positive(),
  gateway: z.string().min(1),
  notes: z.string(),
  batteryPowered: z.boolean(),
  gatewayConnected: z.boolean(),
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
    const sensors = await listSensors(farm.id);
    return Response.json({ sensors });
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

  const parsed = createSensorSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid sensor payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { id, ...input } = parsed.data;
    const sensor = await createSensor(farm.id, id, input as typeof input & { sensorType: (typeof SENSOR_TYPES)[number]; communicationType: (typeof COMMUNICATION_TYPES)[number] });
    if (!sensor) {
      return Response.json({ error: "Assigned plot doesn't belong to this farm." }, { status: 400 });
    }
    return Response.json({ sensor }, { status: 201 });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
