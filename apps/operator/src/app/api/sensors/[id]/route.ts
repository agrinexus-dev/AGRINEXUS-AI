import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { deleteSensor, syncSensorTelemetry } from "@/lib/sensors/sensors-service";

/**
 * `PATCH /api/sensors/:id` (telemetry sync — battery/signal/reading/status/
 * health) / `DELETE /api/sensors/:id` — No general "edit
 * sensor identity fields" endpoint: audited the existing UI (Part 5's own
 * instruction — "only implement operations actually required") and found
 * no "Edit Sensor" surface calling `updateSensor()` anywhere; only
 * telemetry-shaped actions (Restart, Calibrate, Maintenance toggle, and the
 * background simulation sync) exist, all of which are just different
 * partial telemetry patches — one endpoint covers all of them.
 */

const telemetryUpdateSchema = z
  .object({
    batteryPercent: z.number().min(0).max(100),
    signalPercent: z.number().min(0).max(100),
    currentReading: z.number().finite(),
    previousReading: z.number().finite(),
    readingHistory: z.array(z.number().finite()),
    lastReadingAt: z.number().finite(),
    status: z.enum(["online", "offline", "warning", "critical", "maintenance"]),
    health: z.enum(["nominal", "attention", "critical"]),
  })
  .partial();

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

  const parsed = telemetryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid telemetry payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updated = await syncSensorTelemetry(farm.id, id, parsed.data);
    if (!updated) {
      return Response.json({ error: "Sensor not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
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
    const deleted = await deleteSensor(farm.id, id);
    if (!deleted) {
      return Response.json({ error: "Sensor not found." }, { status: 404 });
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
