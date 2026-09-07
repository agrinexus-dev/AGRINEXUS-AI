import "server-only";

import { z } from "zod";

import { auth } from "@/lib/auth/auth";
import { ADMIN_APP_ROLES, hasAnyRole, ROLES, type Role } from "@/lib/auth/roles";
import type { AppSessionUser } from "@/lib/auth/types";
import { createProfile, listFarms, listProfiles } from "@/lib/admin/admin-service";

/**
 * `GET/POST /api/admin/users` — Section-gated pages
 * (`/admin/**`) are already checked by `middleware.ts`, but API routes are
 * deliberately NOT section-gated there (see that file's own comment) — so
 * every admin API route re-checks `roles.includes("admin")` itself, the
 * same defense-in-depth pattern `getFarmForSession` already gives every
 * other route.
 */
const roleEnum = z.enum([...ROLES] as [string, ...string[]]);

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  roles: z.array(roleEnum).min(1),
  defaultRole: roleEnum,
  farmId: z.string().nullable().optional(),
});

function isAdmin(user: AppSessionUser | undefined): boolean {
  return Boolean(user && hasAnyRole(user.roles ?? [user.role], ADMIN_APP_ROLES));
}

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!isAdmin(session?.user as AppSessionUser | undefined)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const [profiles, farms] = await Promise.all([listProfiles(), listFarms()]);
  return Response.json({ profiles, farms });
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!isAdmin(session?.user as AppSessionUser | undefined)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid profile data." }, { status: 400 });
  }

  const { name, email, password, roles, defaultRole, farmId } = parsed.data;
  if (!roles.includes(defaultRole)) {
    return Response.json({ error: "Default role must be one of the assigned roles." }, { status: 400 });
  }

  const result = await createProfile({
    name,
    email,
    password,
    role: defaultRole as Role,
    roles: roles as Role[],
    farmId: farmId ?? null,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 409 });
  }

  return Response.json({ id: result.id }, { status: 201 });
}
