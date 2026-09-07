import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { hasAnyRole, OPERATOR_APP_ROLES } from "@/lib/auth/roles";
import type { AppSessionUser } from "@/lib/auth/types";
import { reorderEndpoints } from "@/lib/aura/router/endpoint-registry";

/**
 * `POST /api/aura/router/endpoints/reorder` — the
 * drag-and-drop priority UI's persistence write. Body is the FULL new
 * ordering as an array of endpoint ids (index 0 = priority 1); rejected
 * (400) if it doesn't name exactly the current full set of endpoints —
 * see `reorderEndpoints`'s own doc comment for why a partial/stale list is
 * refused rather than silently applied. One atomic transaction — the
 * live router (`aura-router.ts`'s `listAllEndpoints`) reads the new order
 * on its very next request, automatic AND streaming alike.
 */
function isOperatorOrAdmin(user: AppSessionUser | undefined): boolean {
  return Boolean(user && hasAnyRole(user.roles ?? [user.role], OPERATOR_APP_ROLES));
}

const bodySchema = z.object({ orderedIds: z.array(z.string().min(1)).min(1) });

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!isOperatorOrAdmin(session?.user as AppSessionUser | undefined)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await reorderEndpoints(body.orderedIds);
  if (!result) {
    return Response.json({ error: "orderedIds must name exactly the current set of configured endpoints." }, { status: 400 });
  }
  return Response.json({ endpoints: result });
}
