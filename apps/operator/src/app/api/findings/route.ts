import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { createFinding, listFindings } from "@/lib/findings/findings-service";
import { CROP_ISSUE_SEVERITIES, CROP_ISSUE_TYPES } from "@/lib/findings/types";

/**
 * `GET /api/findings` (list) / `POST /api/findings` (create) — Crop
 * Inspection findings, mirroring `/api/alerts`'s exact conventions. Ownership
 * is ALWAYS derived from the session (`getFarmForSession`); the client
 * never supplies a farmId.
 */

const FINDING_STATUSES = ["detected", "resolved", "requires-human-action"] as const;
const DETECTION_METHODS = ["drone", "robot"] as const;

const createFindingSchema = z.object({
  id: z.string().min(1),
  plotId: z.string().min(1),
  issueType: z.enum(CROP_ISSUE_TYPES as [string, ...string[]]),
  severity: z.enum(CROP_ISSUE_SEVERITIES as [string, ...string[]]),
  position: z.tuple([z.number().finite(), z.number().finite()]),
  description: z.string().min(1).max(500),
  status: z.enum(FINDING_STATUSES),
  detectionMethod: z.enum(DETECTION_METHODS),
  detectedByDroneMissionId: z.string().nullable(),
  detectedByRobotMissionId: z.string().nullable(),
  correctiveActionType: z.string().nullable(),
  correctiveActionDescription: z.string().nullable(),
  resolvedByRobotMissionId: z.string().nullable(),
  detectedAt: z.number(),
  resolvedAt: z.number().nullable(),
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
    const findings = await listFindings(farm.id);
    return Response.json({ findings });
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

  const parsed = createFindingSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid finding payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finding = await createFinding(farm.id, parsed.data as any);
    if (!finding) {
      return Response.json({ error: "Target plot doesn't belong to this farm." }, { status: 400 });
    }
    return Response.json({ finding }, { status: 201 });
  } catch (error) {
    return Response.json({ error: describeError(error) }, { status: 500 });
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}
