import "server-only";

import { auth } from "@/lib/auth/auth";
import { hasAnyRole, OPERATOR_APP_ROLES } from "@/lib/auth/roles";
import type { AppSessionUser } from "@/lib/auth/types";
import { isCredentialConfigured } from "@/lib/aura/router/endpoint-registry";
import { AURA_MODEL_CATALOG } from "@/lib/aura/router/model-catalog";

/**
 * `GET /api/aura/router/catalog` — backs the "Add
 * Model" dialog's provider/credential/model dropdowns. Static, verified
 * data only (`model-catalog.ts`) plus a per-credential `configured`
 * boolean (present/missing, never the value) — Operator/Admin only, same
 * convention as every other router management route.
 */
function isOperatorOrAdmin(user: AppSessionUser | undefined): boolean {
  return Boolean(user && hasAnyRole(user.roles ?? [user.role], OPERATOR_APP_ROLES));
}

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!isOperatorOrAdmin(session?.user as AppSessionUser | undefined)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const providers = AURA_MODEL_CATALOG.map((entry) => ({
    provider: entry.provider,
    label: entry.label,
    credentials: entry.credentialEnvVars.map((envVar) => ({ envVar, configured: isCredentialConfigured(envVar) })),
    models: entry.models,
  }));

  return Response.json({ providers });
}
