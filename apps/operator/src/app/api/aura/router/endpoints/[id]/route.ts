import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { hasAnyRole, OPERATOR_APP_ROLES } from "@/lib/auth/roles";
import type { AppSessionUser } from "@/lib/auth/types";
import { deleteEndpoint, getEndpoint, updateEndpoint } from "@/lib/aura/router/endpoint-registry";

/**
 * `PATCH /api/aura/router/endpoints/:id` — Toggles
 * one endpoint's `enabled` state (or, optionally, its capability set) —
 * now a real, durable `AuraRouteEndpoint` row update (Postgres), not the
 * in-memory, this-process-lifetime override used previously. Disabling one
 * model never touches any other row, even one sharing the same credential
 * (Part "Model Enable/Disable": "Disabling Gemini 2.5 Flash must NOT
 * disable Gemini 2.5 Flash-Lite") — each is an independent row by
 * construction. Never touches routing PRIORITY — see the dedicated
 * `/reorder` route for that.
 *
 * `DELETE /api/aura/router/endpoints/:id` — removes one routable endpoint
 * entirely (e.g. undoing an "Add Model" mistake). Never removes a
 * credential — only the row naming this specific provider+credential+model
 * combination.
 */
function isOperatorOrAdmin(user: AppSessionUser | undefined): boolean {
  return Boolean(user && hasAnyRole(user.roles ?? [user.role], OPERATOR_APP_ROLES));
}

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  capabilities: z.array(z.enum(["text", "image", "speech_to_text", "text_to_speech"])).min(1).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth();
  if (!isOperatorOrAdmin(session?.user as AppSessionUser | undefined)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const updated = await updateEndpoint(id, body);
  if (!updated) {
    return Response.json({ error: "No such endpoint." }, { status: 404 });
  }
  return Response.json({ endpoint: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth();
  if (!isOperatorOrAdmin(session?.user as AppSessionUser | undefined)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  if (!(await getEndpoint(id))) {
    return Response.json({ error: "No such endpoint." }, { status: 404 });
  }

  const removed = await deleteEndpoint(id);
  return removed ? Response.json({ id, deleted: true }) : Response.json({ error: "Could not delete endpoint." }, { status: 500 });
}
