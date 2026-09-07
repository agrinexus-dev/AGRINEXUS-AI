import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { hasAnyRole, OPERATOR_APP_ROLES } from "@/lib/auth/roles";
import type { AppSessionUser } from "@/lib/auth/types";
import { addEndpointToCapability, CapabilityMismatchError, InvalidEndpointError, removeEndpointFromCapability } from "@/lib/aura/router/endpoint-registry";
import type { AuraCapability } from "@/lib/aura/router/types";

/**
 * `POST /api/aura/router/routing/:capability/participation` — AgriNexus AI
 * the "Add/Remove endpoint from capability chain" write. This is
 * DELIBERATELY separate from `PATCH /api/aura/router/endpoints/:id`'s
 * global `enabled` toggle — adding/removing here never changes
 * whether the endpoint is globally enabled, and never affects its
 * participation in any OTHER capability's chain. Server-side capability
 * validation is mandatory (Part 7/29 #16-18): `addEndpointToCapability`
 * rejects outright if the endpoint's own declared `capabilities` doesn't
 * include this one — the UI never has to be trusted as the only guard.
 */
function isOperatorOrAdmin(user: AppSessionUser | undefined): boolean {
  return Boolean(user && hasAnyRole(user.roles ?? [user.role], OPERATOR_APP_ROLES));
}

const VALID_CAPABILITIES: AuraCapability[] = ["text", "image", "speech_to_text", "text_to_speech"];
const bodySchema = z.object({ endpointId: z.string().min(1), participate: z.boolean() });

export async function POST(request: Request, { params }: { params: Promise<{ capability: string }> }): Promise<Response> {
  const session = await auth();
  if (!isOperatorOrAdmin(session?.user as AppSessionUser | undefined)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const { capability: rawCapability } = await params;
  if (!VALID_CAPABILITIES.includes(rawCapability as AuraCapability)) {
    return Response.json({ error: `"${rawCapability}" is not a valid AURA capability.` }, { status: 400 });
  }
  const capability = rawCapability as AuraCapability;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    if (body.participate) {
      await addEndpointToCapability(body.endpointId, capability);
    } else {
      await removeEndpointFromCapability(body.endpointId, capability);
    }
    return Response.json({ capability, endpointId: body.endpointId, participating: body.participate });
  } catch (error) {
    if (error instanceof CapabilityMismatchError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof InvalidEndpointError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json({ error: "Could not update capability participation." }, { status: 500 });
  }
}
