import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { createAlert, listAlerts, upsertFindingAlert } from "@/lib/alerts/alerts-service";
import { getFarmForSession } from "@/lib/farm/current-farm";

/**
 * `GET /api/alerts` (list) / `POST /api/alerts` (create).
 * Mirrors the exact conventions the existing
 * `/api/aura/*` routes already establish in this app: `import
 * "server-only"`, `auth()` first, a consistent `{ error: string }` shape
 * on failure. Ownership is ALWAYS derived from the session
 * (`getFarmForSession`) — nothing here trusts a farmId from the client,
 * because nothing here ever reads one from the client at all.
 *
 * Two request shapes, told apart by which fields are present (`findingId`
 * vs `sensorId`/`value`) — NOT two routes, since both still write the SAME
 * `Alert` table via the SAME POST verb; the sensor-alert schema/behavior
 * below is completely untouched.
 */

const ALERT_TYPES = ["low-soil-moisture", "low-battery", "poor-signal", "abnormal-temperature", "sensor-offline"] as const;
const ALERT_SEVERITIES = ["warning", "critical"] as const;

const createAlertSchema = z.object({
  sensorId: z.string().min(1),
  sensorName: z.string().min(1),
  alertType: z.enum(ALERT_TYPES),
  severity: z.enum(ALERT_SEVERITIES),
  message: z.string().min(1).max(500),
  value: z.number().finite(),
});

const upsertFindingAlertSchema = z.object({
  findingId: z.string().min(1),
  alertType: z.literal("crop-finding"),
  severity: z.enum(ALERT_SEVERITIES),
  message: z.string().min(1).max(500),
  resolved: z.boolean(),
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
    const alerts = await listAlerts(farm.id);
    return Response.json({ alerts });
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

  // Told apart by shape, not a separate route — see this file's top doc
  // comment. `findingId` only ever appears on the finding-linked branch.
  if (typeof body === "object" && body !== null && "findingId" in body) {
    const parsedFinding = upsertFindingAlertSchema.safeParse(body);
    if (!parsedFinding.success) {
      return Response.json({ error: "Invalid finding alert payload.", details: parsedFinding.error.flatten() }, { status: 400 });
    }
    try {
      const alert = await upsertFindingAlert(farm.id, parsedFinding.data);
      if (!alert) {
        return Response.json({ error: "Target finding doesn't belong to this farm." }, { status: 400 });
      }
      return Response.json({ alert }, { status: 201 });
    } catch (error) {
      return Response.json({ error: describeError(error) }, { status: 500 });
    }
  }

  const parsed = createAlertSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid alert payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const alert = await createAlert(farm.id, parsed.data);
    return Response.json({ alert }, { status: 201 });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
