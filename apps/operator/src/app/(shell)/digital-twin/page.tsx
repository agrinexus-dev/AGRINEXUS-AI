import { DigitalTwinPage } from "@/components/digital-twin/digital-twin-page";
import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { listPlots } from "@/lib/plots/plots-service";

/**
 * Server Component ("prefer server-loaded... over
 * unnecessary client-side fetching") — fetches Plot data directly via
 * `listPlots()` in the same process (no HTTP round-trip to its own
 * `/api/plots` route) and passes it straight into `DigitalTwinPage` as a
 * prop, so the Plot Store hydrates with zero client-side fetch in the
 * common case. Falls back to an empty array (which `DigitalTwinPage` itself
 * treats as "fetch client-side instead") if the session/farm can't be
 * resolved here for any reason — this route is already behind the shell's
 * auth-gating middleware, so an unauthenticated request never reaches this
 * far, but a missing Farm row is handled gracefully rather than thrown.
 */
export default async function Page() {
  const session = await auth();
  const farm = session?.user ? await getFarmForSession(session.user as AppSessionUser) : null;
  const initialPlots = farm ? await listPlots(farm.id) : [];

  return <DigitalTwinPage initialPlots={initialPlots} />;
}
