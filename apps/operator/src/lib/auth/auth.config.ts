import type { NextAuthConfig } from "next-auth";
import { encode as defaultEncode } from "next-auth/jwt";

import type { AppSessionUser, AppToken } from "./types";
import type { AuthenticatedLocalUser } from "./user-source";

/**
 * Ceiling for a "remembered" session, and what an unchecked one actually
 * gets instead. `encode()` below is what makes this real — see its comment.
 */
const REMEMBERED_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24;

/**
 * Edge-safe Auth.js config shared between `auth.ts` (the full config, used
 * by the API route handler — has the Credentials provider and talks to
 * ./user-source.ts) and `middleware.ts` (Edge runtime — only ever decodes an
 * existing JWT, never signs one, so it never needs the provider list).
 *
 * Keeping `providers` empty here is what keeps bcryptjs and the user source
 * out of the Edge middleware bundle. `next-auth/jwt`'s `encode`/`decode` are
 * plain `jose`-based functions and are Edge-safe on their own.
 */
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  // Required for any self-hosted deployment (i.e. not Vercel) — without it
  // Auth.js refuses every request with an "UntrustedHost" error, since it
  // can't otherwise verify the incoming Host header is the real deployment.
  trustHost: true,
  session: {
    strategy: "jwt",
    // The ceiling — see `jwt.encode` below for what actually decides a
    // given session's real lifetime.
    maxAge: REMEMBERED_MAX_AGE_SECONDS,
  },
  jwt: {
    // Auth.js's default `encode()` always derives the JWT's `exp` claim
    // from `now() + maxAge` using this *static* `session.maxAge`, ignoring
    // anything set on `token.exp` inside the `jwt` callback — mutating
    // `token.exp` there (an earlier version of this file did) has no
    // effect on the real, signed token. This is the actual, documented
    // extension point for varying it: override `encode` and pick the
    // `maxAge` passed to the default implementation based on the token's
    // own `rememberMe` flag (set once, at sign-in, in the `jwt` callback).
    encode: async ({ token, secret, salt }) => {
      const rememberMe = Boolean((token as unknown as AppToken | undefined)?.rememberMe);
      const maxAge = rememberMe ? REMEMBERED_MAX_AGE_SECONDS : DEFAULT_MAX_AGE_SECONDS;
      return defaultEncode({ token, secret, salt, maxAge });
    },
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      // See./types.ts — declaration merging into next-auth's JWT/User
      // interfaces doesn't reliably take effect in this workspace, so both
      // sides of this callback are handled via explicit casts.
      const appToken = token as unknown as AppToken;

      if (user) {
        // On initial sign-in `user` is always whatever our own Credentials
        // `authorize()` returned (see auth.ts) — never an OAuth/adapter user.
        const authenticatedUser = user as AuthenticatedLocalUser & { rememberMe?: boolean };
        appToken.id = authenticatedUser.id;
        appToken.role = authenticatedUser.role;
        appToken.roles = authenticatedUser.roles;
        appToken.rememberMe = Boolean(authenticatedUser.rememberMe);
      }

      return token;
    },
    session({ session, token }) {
      const appToken = token as unknown as AppToken;
      const appUser = session.user as unknown as AppSessionUser;
      appUser.id = appToken.id;
      appUser.role = appToken.role;
      appUser.roles = appToken.roles ?? [appToken.role];
      return session;
    },
  },
};
