import "server-only";

import { FARMER_APP_ROLES, hasAnyRole, OPERATOR_APP_ROLES } from "@/lib/auth/roles";
import type { AppSessionUser } from "@/lib/auth/types";
import { prisma } from "@/lib/prisma/client";

/**
 * Resolves the Farm an authenticated session is allowed to act on (Prompt
 * 018B Part 12: "Authenticated User → Owned Farm/Workspace → Alerts").
 *
 * The product has no multi-tenant concept yet — every session inside the
 * Operator app (only `admin`/`operator` roles can reach it at all, per
 * `OPERATOR_APP_ROLES`) already sees the exact same shared demo
 * environment (one Fleet, one Digital Twin, one set of sensors). This
 * deliberately preserves that behavior rather than inventing per-user
 * farms: both roles resolve to the SAME seeded "AgriNexus Demo Farm" — this
 * is a real, enforced database lookup (not a rubber stamp: an unrecognized
 * role, or a user with no matching Farm row, gets `null` and is denied), it
 * just isn't a full multi-tenant model, because the product isn't one yet.
 * A `role → farm` lookup is the simplest correct rule for what actually
 * exists today; a real per-user `FarmMember` table is the natural next step
 * once a second real farm exists in the product, not before.
 *
 * Never trusts a farmId supplied by the client — every caller derives it
 * from `session.user.id`/`roles` here, never from a request body/query
 * param.
 *
 * This change extends this for the Farmer role: admin/operator
 * resolution below is byte-for-byte unchanged (same owner-based lookup),
 * and Farmer gets its own, equally server-derived path through the new
 * `FarmMembership` join table (`session.user.id` → membership → farm;
 * never a client-supplied farmId). A profile with no roles at all still
 * gets `null` and is denied.
 */
export async function getFarmForSession(user: Pick<AppSessionUser, "id" | "roles">): Promise<{ id: string; name: string } | null> {
  if (hasAnyRole(user.roles, OPERATOR_APP_ROLES)) {
    // Every recognized admin/operator session resolves to whichever Farm
    // the seeded admin account owns — see scripts/seed-alerts.ts. Looked up
    // by owner rather than hardcoding the farm id here, so re-seeding onto
    // a fresh database (a different farm id) doesn't require a code change.
    return prisma.farm.findFirst({ where: { ownerId: "usr_admin" }, select: { id: true, name: true } });
  }

  if (hasAnyRole(user.roles, FARMER_APP_ROLES)) {
    const membership = await prisma.farmMembership.findFirst({
      where: { userId: user.id },
      select: { farm: { select: { id: true, name: true } } },
    });
    return membership?.farm ?? null;
  }

  return null;
}
