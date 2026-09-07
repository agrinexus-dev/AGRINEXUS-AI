import "server-only";

import { auth } from "@/lib/auth/auth";
import { hasAnyRole, OPERATOR_APP_ROLES } from "@/lib/auth/roles";
import type { AppSessionUser } from "@/lib/auth/types";
import { getCapabilityRoutingView, getEndpointHealth, getEndpointRuntimeSnapshot, isEndpointConfigured } from "@/lib/aura/router/endpoint-registry";
import type { AuraCapability } from "@/lib/aura/router/types";

/**
 * `GET /api/aura/router/routing/:capability` — backs one capability tab
 * (TEXT/IMAGE/VOICE) in
 * the Operator Router UI. Operator/Admin only, re-checked here per this
 * project's standing convention. Returns three lists, never a key:
 *  - `chain` — the endpoints genuinely participating in THIS capability's
 *  fallback order, in priority order (what `aura-router.ts` actually
 *  uses).
 *  - `eligibleNotParticipating` — endpoints that structurally SUPPORT this
 *  capability but aren't currently in its chain ("capability
 *  routing participation" — addable via the participation route).
 *  - `unavailable` — endpoints that do NOT support this capability at all
 *  ("Unavailable endpoints" informational section — never
 *  draggable, never addable).
 */
function isOperatorOrAdmin(user: AppSessionUser | undefined): boolean {
  return Boolean(user && hasAnyRole(user.roles ?? [user.role], OPERATOR_APP_ROLES));
}

const VALID_CAPABILITIES: AuraCapability[] = ["text", "image", "speech_to_text", "text_to_speech"];

export async function GET(_request: Request, { params }: { params: Promise<{ capability: string }> }): Promise<Response> {
  const session = await auth();
  if (!isOperatorOrAdmin(session?.user as AppSessionUser | undefined)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const { capability: rawCapability } = await params;
  if (!VALID_CAPABILITIES.includes(rawCapability as AuraCapability)) {
    return Response.json({ error: `"${rawCapability}" is not a valid AURA capability.` }, { status: 400 });
  }
  const capability = rawCapability as AuraCapability;

  const view = await getCapabilityRoutingView(capability);

  function shapeEndpoint(endpoint: (typeof view.chain)[number]["endpoint"], priority: number | null) {
    const runtime = getEndpointRuntimeSnapshot(endpoint.id);
    return {
      id: endpoint.id,
      provider: endpoint.provider,
      credentialEnv: endpoint.apiKeyEnvVar,
      model: endpoint.model,
      displayName: endpoint.displayName,
      enabled: endpoint.enabled,
      capabilities: endpoint.capabilities,
      priority,
      configured: isEndpointConfigured(endpoint),
      health: getEndpointHealth(endpoint),
      lastSuccessAt: runtime.lastSuccessAt,
      lastFailureAt: runtime.lastFailureAt,
      lastFailureReason: runtime.lastFailureReason,
      latencyMsLastSample: runtime.latencyMsLastSample,
      successCount: runtime.successCount,
      failureCount: runtime.failureCount,
    };
  }

  return Response.json({
    capability,
    chain: view.chain.map((entry) => shapeEndpoint(entry.endpoint, entry.priority)),
    eligibleNotParticipating: view.eligibleNotParticipating.map((endpoint) => shapeEndpoint(endpoint, null)),
    unavailable: view.unavailable.map((endpoint) => shapeEndpoint(endpoint, null)),
  });
}
