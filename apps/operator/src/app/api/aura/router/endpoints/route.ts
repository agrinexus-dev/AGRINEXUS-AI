import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { hasAnyRole, OPERATOR_APP_ROLES } from "@/lib/auth/roles";
import type { AppSessionUser } from "@/lib/auth/types";
import {
  createEndpoint,
  DuplicateEndpointError,
  getEndpointHealth,
  getEndpointRuntimeSnapshot,
  InvalidEndpointError,
  isEndpointConfigured,
} from "@/lib/aura/router/endpoint-registry";
import { listConfiguredEndpoints } from "@/lib/aura/router/aura-router";
import type { AuraCapability } from "@/lib/aura/router/types";
import { PROVIDER_IDS } from "@/lib/aura/types";

/**
 * `GET /api/aura/router/endpoints` — Operator/Admin only (re-checked here, not just at the
 * `middleware.ts` section level — same defense-in-depth convention every
 * other API route in this project already follows). Returns ONLY safe
 * metadata: id, provider, credential ENV VAR NAME, model, display name,
 * capabilities, priority, health, and whether an API key is PRESENT (a
 * boolean) — never the key itself, never any part of it.
 *
 * `POST /api/aura/router/endpoints` — the "Add Model" write.
 * Validates against the verified catalog (`model-catalog.ts`) — never
 * accepts an arbitrary, unverified model id (Part "prefer a verified
 * catalog"). Appended to the end of the priority order; reordering happens
 * through the dedicated `/reorder` route.
 */
function isOperatorOrAdmin(user: AppSessionUser | undefined): boolean {
  return Boolean(user && hasAnyRole(user.roles ?? [user.role], OPERATOR_APP_ROLES));
}

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!isOperatorOrAdmin(session?.user as AppSessionUser | undefined)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const endpoints = await listConfiguredEndpoints();
  const shaped = endpoints.map((endpoint, index) => {
    const runtime = getEndpointRuntimeSnapshot(endpoint.id);
    return {
      id: endpoint.id,
      provider: endpoint.provider,
      credentialEnv: endpoint.apiKeyEnvVar,
      model: endpoint.model,
      displayName: endpoint.displayName,
      enabled: endpoint.enabled,
      capabilities: endpoint.capabilities,
      priority: index + 1,
      configured: isEndpointConfigured(endpoint),
      health: getEndpointHealth(endpoint),
      lastSuccessAt: runtime.lastSuccessAt,
      lastFailureAt: runtime.lastFailureAt,
      lastFailureReason: runtime.lastFailureReason,
      latencyMsLastSample: runtime.latencyMsLastSample,
      successCount: runtime.successCount,
      failureCount: runtime.failureCount,
    };
  });

  return Response.json({ endpoints: shaped });
}

const createSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  credentialEnv: z.string().min(1),
  model: z.string().min(1),
  capabilities: z.array(z.enum(["text", "image", "speech_to_text", "text_to_speech"])).min(1),
});

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!isOperatorOrAdmin(session?.user as AppSessionUser | undefined)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const endpoint = await createEndpoint({
      provider: body.provider,
      credentialEnv: body.credentialEnv,
      model: body.model,
      capabilities: body.capabilities as AuraCapability[],
    });
    return Response.json({ endpoint }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateEndpointError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof InvalidEndpointError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "Could not create endpoint." }, { status: 500 });
  }
}
