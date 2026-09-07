import NextAuth, { type NextAuthResult } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "./auth.config";
import { findUserByCredentials } from "./user-source";

/**
 * Full Auth.js instance — Node runtime only (used by the API route handler
 * and any server component that needs `auth()`). This is the one place that
 * knows about the Credentials provider and the local user source; swapping
 * ./user-source.ts for a real backend later doesn't touch this file.
 *
 * The explicit `NextAuthResult` annotation avoids TS2742: without it, the
 * inferred type of `auth`/`signIn` can't be printed portably from a package
 * (`@auth/core`) that isn't a direct dependency of this app under pnpm's
 * strict dependency isolation.
 */
const result: NextAuthResult = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { label: "Remember me", type: "text" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;

        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await findUserByCredentials(email, password);
        if (!user) {
          return null;
        }

        return { ...user, rememberMe: credentials?.remember === "true" };
      },
    }),
  ],
});

// Destructuring `result` directly into individual exports still hits
// TS2742 (each export needs its own portable type, and merely typing the
// container isn't enough) — indexed-access annotations on the named
// `NextAuthResult` interface are what actually resolves it.
export const handlers: NextAuthResult["handlers"] = result.handlers;
export const auth: NextAuthResult["auth"] = result.auth;
export const signIn: NextAuthResult["signIn"] = result.signIn;
export const signOut: NextAuthResult["signOut"] = result.signOut;
