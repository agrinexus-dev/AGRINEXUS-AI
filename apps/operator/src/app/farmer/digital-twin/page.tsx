import { DigitalTwinPage } from "@/components/digital-twin/digital-twin-page";
import { auth } from "@/lib/auth/auth";
import type { AppSessionUser } from "@/lib/auth/types";
import { getFarmForSession } from "@/lib/farm/current-farm";
import { listPlots } from "@/lib/plots/plots-service";

/**
 * The Farmer route into the EXISTING simulated Digital
 * Twin. Byte-for-byte the same pattern as `(shell)/digital-twin/page.tsx`
 * (Server Component, farm-scoped `listPlots` fetched directly, same
 * `DigitalTwinPage` component) — no second Digital Twin implementation,
 * per Part 14's explicit instruction. The Simulation/real-hardware toggle
 * mentioned in later phases is intentionally not added here yet.
 */
export default async function Page() {
  const session = await auth();
  const farm = session?.user ? await getFarmForSession(session.user as AppSessionUser) : null;
  const initialPlots = farm ? await listPlots(farm.id) : [];

  return <DigitalTwinPage initialPlots={initialPlots} />;
}
