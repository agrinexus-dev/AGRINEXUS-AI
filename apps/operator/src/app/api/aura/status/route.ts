import "server-only";

import { auth } from "@/lib/auth/auth";
import { listProviderMeta, getProvider } from "@/lib/aura/providers/provider-registry";
import type { ProviderConnectionStatus, ProviderId, ProviderStatusResponse } from "@/lib/aura/types";

/** Per-provider connection status for the AURA Settings panel. Never returns the key/secret itself, only whether each provider is reachable. */
export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const meta = listProviderMeta();
  const entries = await Promise.all(
    meta.map(async (providerMeta): Promise<[ProviderId, ProviderConnectionStatus]> => [
      providerMeta.id,
      await getProvider(providerMeta.id).getStatus(),
    ]),
  );

  const statuses = Object.fromEntries(entries) as ProviderStatusResponse["statuses"];
  return Response.json({ statuses } satisfies ProviderStatusResponse);
}
