import "server-only";

import { prisma } from "@/lib/prisma/client";

/**
 * Server-only Farm Settings data access — the two global
 * autonomous-behavior toggles, persisted per-farm on the `Farm` row itself
 * (added this change — see `schema.prisma`'s own doc comment on those two
 * columns for why a real migration was genuinely required). Mirrors every
 * other `*-service.ts` in this repo: farm-scoped, every function takes
 * `farmId` explicitly, callers derive it from the authenticated session via
 * `getFarmForSession`, never from client input.
 */

export interface FarmAutonomousState {
  droneAutonomousEnabled: boolean;
  robotAutonomousEnabled: boolean;
}

export async function getFarmAutonomousState(farmId: string): Promise<FarmAutonomousState | null> {
  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { droneAutonomousEnabled: true, robotAutonomousEnabled: true } });
  if (!farm) return null;
  return farm;
}

export interface UpdateFarmAutonomousStateInput {
  droneAutonomousEnabled?: boolean;
  robotAutonomousEnabled?: boolean;
}

/** Partial update — a toggle only ever changes one vehicle kind's flag at a time (see `autonomous-behavior.ts`'s `setDroneAutonomousEnabled`/`setRobotAutonomousEnabled`, the only two callers). Returns `null` (never throws) if the farm doesn't exist — the route answers 404, same non-leaking pattern every other service uses. */
export async function updateFarmAutonomousState(farmId: string, patch: UpdateFarmAutonomousStateInput): Promise<FarmAutonomousState | null> {
  const existing = await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true } });
  if (!existing) return null;

  const farm = await prisma.farm.update({
    where: { id: farmId },
    data: patch,
    select: { droneAutonomousEnabled: true, robotAutonomousEnabled: true },
  });
  return farm;
}
