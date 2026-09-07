import type { Role } from "./roles";

/**
 * Declaration merging into next-auth's `Session`/`User`/`JWT` interfaces
 * does not reliably take effect in this workspace: `next-auth`'s `.d.ts`
 * re-exports those interfaces from `@auth/core/types` (`export type { User }
 * from...`) rather than declaring them locally, and — unlike a locally
 * declared interface — that re-export does not consistently participate in
 * `declare module "next-auth" {... }` augmentation here. Every place that
 * needs `id`/`role` off a session or token casts through these types
 * instead of relying on augmentation.
 */
export interface AppSessionUser {
  id: string;
  /** Default/landing role — see the `role` field's doc comment on the Prisma `User` model. */
  role: Role;
  /**
   * The full set of roles this profile is authorized to
   * use. This, not `role`, is what every authorization check (middleware
   * section gating, farm-membership resolution, the role switcher) reads;
   * `role` is display/landing-only. Always contains at least `role`.
   */
  roles: Role[];
  name: string;
  email: string;
}

export interface AppToken {
  id: string;
  role: Role;
  roles: Role[];
  rememberMe: boolean;
}
