export const ROLES = ["admin", "operator", "farmer"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Roles permitted inside the Operator application shell (unprefixed routes — "/", "/digital-twin", etc). */
export const OPERATOR_APP_ROLES: readonly Role[] = ["admin", "operator"];

/** Roles permitted inside the Farmer section ("/farmer/..."). */
export const FARMER_APP_ROLES: readonly Role[] = ["farmer"];

/** Roles permitted inside the Admin section ("/admin/..."). */
export const ADMIN_APP_ROLES: readonly Role[] = ["admin"];

/** True if `roles` (a profile's full authorized set) contains any role in `allowed`. */
export function hasAnyRole(roles: readonly Role[], allowed: readonly Role[]): boolean {
  return roles.some((role) => allowed.includes(role));
}

/** Where a fresh sign-in with no explicit `callbackUrl` should land, keyed off the profile's default `role` (Part 5). */
export function getDefaultLandingPath(role: Role): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "farmer":
      return "/farmer";
    case "operator":
      return "/";
  }
}
