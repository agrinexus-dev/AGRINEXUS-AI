import "server-only";

import { prisma } from "@/lib/prisma/client";

/**
 * Server-only Farm Location data access — mirrors
 * `farm-settings-service.ts`'s exact shape: farm-scoped, takes `farmId`
 * explicitly, callers derive it from the authenticated session via
 * `getFarmForSession`, never from client input.
 */

export interface FarmLocation {
  latitude: number;
  longitude: number;
}

/** `null` if the farm doesn't exist OR (just as honestly) if it exists but has no location configured yet — both cases the caller treats as "farm location not configured", never a fabricated default coordinate. */
export async function getFarmLocation(farmId: string): Promise<FarmLocation | null> {
  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { latitude: true, longitude: true } });
  if (!farm || farm.latitude === null || farm.longitude === null) return null;
  return { latitude: farm.latitude, longitude: farm.longitude };
}

/**
 * Persists an operator-selected real-world location onto the
 * authenticated farm. Range/finite validation happens one layer up, in the
 * API route's zod schema (same "validate at the API boundary" convention
 * every other `PATCH` route in this app already follows — e.g.
 * `/api/farm/autonomous`) — this function trusts its caller the same way
 * `updateFarmAutonomousState` trusts its own. Returns `null` (never throws)
 * if the farm doesn't exist, the same non-leaking pattern every other
 * `*-service.ts` update function in this repo uses.
 */
export async function updateFarmLocation(farmId: string, location: FarmLocation): Promise<FarmLocation | null> {
  const existing = await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true } });
  if (!existing) return null;

  const farm = await prisma.farm.update({
    where: { id: farmId },
    data: { latitude: location.latitude, longitude: location.longitude },
    select: { latitude: true, longitude: true },
  });
  // `farm.latitude`/`farm.longitude` are guaranteed non-null here — we just
  // wrote them ourselves — but Prisma's generated type is still `number |
  // null` (the column itself is nullable), so this narrows honestly rather
  // than asserting.
  if (farm.latitude === null || farm.longitude === null) return null;
  return { latitude: farm.latitude, longitude: farm.longitude };
}
