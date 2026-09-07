import "server-only";

import { z } from "zod";

import { updateProfile } from "@/lib/admin/admin-service";
import { auth } from "@/lib/auth/auth";
import { ADMIN_APP_ROLES, hasAnyRole, ROLES, type Role } from "@/lib/auth/roles";
import type { AppSessionUser } from "@/lib/auth/types";

const roleEnum = z.enum([...ROLES] as [string, ...string[]]);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  roles: z.array(roleEnum).min(1).optional(),
  defaultRole: roleEnum.optional(),
  status: z.enum(["active", "disabled"]).optional(),
  farmId: z.string().nullable().optional(),
  password: z.string().min(8).optional(),
});

function isAdmin(user: AppSessionUser | undefined): boolean {
  return Boolean(user && hasAnyRole(user.roles ?? [user.role], ADMIN_APP_ROLES));
}

/**
 * `PATCH /api/admin/users/:id` — same defense-in-depth
 * admin check as `/api/admin/users` (see that file's doc comment).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth();
  const sessionUser = session?.user as AppSessionUser | undefined;
  if (!isAdmin(sessionUser)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid profile data." }, { status: 400 });
  }

  const { name, roles, defaultRole, status, farmId, password } = parsed.data;
  if (roles && defaultRole && !roles.includes(defaultRole)) {
    return Response.json({ error: "Default role must be one of the assigned roles." }, { status: 400 });
  }

  // A profile may not disable or demote itself out of Admin — the one
  // guard against an admin locking themselves out ("Admin role
  // cannot be obtained through client-side manipulation" cuts both ways:
  // it also should not be trivially self-revoked by mistake).
  if (id === sessionUser?.id) {
    if (status === "disabled") {
      return Response.json({ error: "You cannot disable your own account." }, { status: 400 });
    }
    if (roles && !roles.includes("admin")) {
      return Response.json({ error: "You cannot remove your own Admin role." }, { status: 400 });
    }
  }

  const result = await updateProfile(id, {
    name,
    roles: roles as Role[] | undefined,
    role: defaultRole as Role | undefined,
    status,
    farmId,
    password,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 404 });
  }

  return Response.json({ ok: true });
}
