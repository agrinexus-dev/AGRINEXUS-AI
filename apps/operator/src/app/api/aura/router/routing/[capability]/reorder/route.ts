import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { hasAnyRole, OPERATOR_APP_ROLES } from "@/lib/auth/roles";
import type { AppSessionUser } from "@/lib/auth/types";
import { reorderCapabilityChain } from "@/lib/aura/router/endpoint-registry";
import type { AuraCapability } from "@/lib/aura/router/types";

/**
 * `POST /api/aura/router/routing/:capability/reorder` — AgriNexus AI
 * The drag-and-drop priority UI's persistence write, now scoped
 * to ONE capability's chain. Body is the full new ordering of
 * endpoint ids CURRENTLY PARTICIPATING in this capability (index 0 =
 * priority 1) — rejected (400) if it doesn't name exactly that set, same
 * safety rule the endpoint-level reorder already established, now
 * applied per-capability so reordering TEXT can never accidentally corrupt
 * IMAGE's or VOICE's own independent order (Part "Capability
 * independence").
 */
function isOperatorOrAdmin(user: AppSessionUser | undefined): boolean {
  return Boolean(user && hasAnyRole(user.roles ?? [user.role], OPERATOR_APP_ROLES));
}

const VALID_CAPABILITIES: AuraCapability[] = ["text", "image", "speech_to_text", "text_to_speech"];
const bodySchema = z.object({ orderedIds: z.array(z.string().min(1)) });

export async function POST(request: Request, { params }: { params: Promise<{ capability: string }> }): Promise<Response> {
  const session = await auth();
  if (!isOperatorOrAdmin(session?.user as AppSessionUser | undefined)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const { capability: rawCapability } = await params;
  if (!VALID_CAPABILITIES.includes(rawCapability as AuraCapability)) {
    return Response.json({ error: `"${rawCapability}" is not a valid AURA capability.` }, { status: 400 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await reorderCapabilityChain(rawCapability as AuraCapability, body.orderedIds);
  if (!result) {
    return Response.json({ error: "orderedIds must name exactly the endpoints currently participating in this capability's chain." }, { status: 400 });
  }
  return Response.json({ capability: rawCapability, chain: result });
}
