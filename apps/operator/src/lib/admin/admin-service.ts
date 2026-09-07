import "server-only";

import bcrypt from "bcryptjs";

import type { Role } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma/client";

export interface ProfileSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  roles: Role[];
  status: "active" | "disabled";
  createdAt: string;
  farms: { id: string; name: string }[];
}

/**
 * The Admin profile-management foundation. Every function
 * here is called ONLY from `app/api/admin/**` route handlers, each of which
 * independently re-checks `roles.includes("admin")` server-side —
 * this module itself does not re-check auth, matching every other
 * `*-service.ts` in this codebase (farm-scoping is the API route's job,
 * enforced there via `getFarmForSession`/session checks, not duplicated
 * inside the service layer).
 */
export async function listProfiles(): Promise<ProfileSummary[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { farmMemberships: { include: { farm: { select: { id: true, name: true } } } } },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roles: user.roles.length > 0 ? user.roles : [user.role],
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    farms: user.farmMemberships.map((membership) => membership.farm),
  }));
}

export async function listFarms(): Promise<{ id: string; name: string }[]> {
  return prisma.farm.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export interface CreateProfileInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  roles: Role[];
  farmId: string | null;
}

export async function createProfile(input: CreateProfileInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() }, select: { id: true } });
  if (existing) {
    return { ok: false, error: "A profile with this email already exists." };
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const id = `usr_${crypto.randomUUID()}`;

  await prisma.user.create({
    data: {
      id,
      name: input.name,
      email: input.email.toLowerCase(),
      role: input.role,
      roles: input.roles,
      passwordHash,
      status: "active",
      ...(input.roles.includes("farmer") && input.farmId
        ? { farmMemberships: { create: { farmId: input.farmId } } }
        : {}),
    },
  });

  return { ok: true, id };
}

export interface UpdateProfileInput {
  name?: string;
  role?: Role;
  roles?: Role[];
  status?: "active" | "disabled";
  farmId?: string | null;
  password?: string;
}

export async function updateProfile(id: string, input: UpdateProfileInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: "Profile not found." };
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.role !== undefined) data.role = input.role;
  if (input.roles !== undefined) data.roles = input.roles;
  if (input.status !== undefined) data.status = input.status;
  if (input.password) data.passwordHash = await bcrypt.hash(input.password, 10);

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.user.update({ where: { id }, data });
    }

    // Part 9 — farm assignment stays a single membership per Farmer-role
    // profile for this foundation phase: replace, never accumulate.
    if (input.farmId !== undefined) {
      await tx.farmMembership.deleteMany({ where: { userId: id } });
      if (input.farmId) {
        await tx.farmMembership.create({ data: { userId: id, farmId: input.farmId } });
      }
    }
  });

  return { ok: true };
}
