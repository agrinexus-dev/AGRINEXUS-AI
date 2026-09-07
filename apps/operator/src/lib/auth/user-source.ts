import "server-only";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma/client";

import type { Role } from "./roles";

export interface AuthenticatedLocalUser {
  id: string;
  email: string;
  name: string;
  /** Default/landing role — see the `role` field's doc comment on the Prisma `User` model. */
  role: Role;
  /** Full set of roles this profile is authorized to use. */
  roles: Role[];
}

/**
 * Real credential lookup backed by the `User` table, replacing
 * the previous hardcoded in-memory `SEED_USERS` array. This is the ONLY
 * module the Credentials provider's `authorize()` talks to (see./auth.ts);
 * swapping the backing store again later means changing this file alone.
 *
 * A disabled account ("Disabled users must not remain
 * authorized") fails here exactly like a wrong password — same generic
 * "Invalid email or password" surfaced to the client either way, so the
 * login form never leaks account existence/status. This check only runs at
 * sign-in: an already-issued JWT session for a user disabled afterward
 * remains valid until it expires or the user signs out — a known, accepted
 * limitation of this app's stateless JWT session strategy (no session
 * store exists to revoke against), not something this change attempts to
 * solve.
 */
export async function findUserByCredentials(
  email: string,
  password: string,
): Promise<AuthenticatedLocalUser | null> {
  const record = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!record || record.status !== "active") {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, record.passwordHash);
  if (!passwordMatches) {
    return null;
  }

  // `roles` is additive (see schema doc comment) and may be empty on a row
  // that predates it — `role` is always a valid fallback member of the set.
  const roles = record.roles.length > 0 ? record.roles : [record.role];

  return { id: record.id, email: record.email, name: record.name, role: record.role, roles };
}
