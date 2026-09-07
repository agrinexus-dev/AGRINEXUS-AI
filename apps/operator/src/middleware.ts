import NextAuth, { type NextAuthRequest, type NextAuthResult } from "next-auth";
import { NextResponse, type NextFetchEvent, type NextMiddleware } from "next/server";

import { authConfig } from "@/lib/auth/auth.config";
import { ADMIN_APP_ROLES, FARMER_APP_ROLES, hasAnyRole, OPERATOR_APP_ROLES } from "@/lib/auth/roles";
import type { AppSessionUser } from "@/lib/auth/types";

// A second, Edge-safe NextAuth instance built from the shared config only —
// it can decode/verify an existing session JWT without ever needing the
// Credentials provider (which lives only in./lib/auth/auth.ts). Explicit
// annotations (`NextAuthResult`, `NextMiddleware` below) avoid TS2742 — see
// the matching note in./lib/auth/auth.ts.
const { auth }: NextAuthResult = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/unauthorized"];

// The second (unused) parameter matters: `auth()`'s middleware overload is
// only selected over its Route Handler overload when the callback's second
// parameter is a `NextFetchEvent` (which has no `params` field) rather than
// an `AppRouteHandlerFnContext` (which requires one) — see auth.ts's note.
const middleware: NextMiddleware = auth((req: NextAuthRequest, _event: NextFetchEvent) => {
  const { nextUrl } = req;
  const isPublicPath = PUBLIC_PATHS.some((path) => nextUrl.pathname.startsWith(path));

  if (isPublicPath) {
    return NextResponse.next();
  }

  const session = req.auth;

  if (!session?.user) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", `${nextUrl.pathname}${nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const user = session.user as unknown as AppSessionUser;
  const roles = user.roles ?? [user.role];

  // API routes are authenticated here but NOT
  // section-gated: every route handler under app/api/** already derives its
  // own farm scope from the session via `getFarmForSession` (never a
  // client-supplied farmId), which is the real authorization boundary for
  // data access. Section-gating API paths the same way as pages would block
  // the Farmer UI's client components from calling the exact same
  // already-farm-scoped endpoints (plots/drones/robots/weather/aura/...)
  // the Operator UI reuses — see Part 18/19: one shared backend, not a
  // second one.
  if (nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Three sections, each gated by whether the profile's
  // full authorized role set (never a single "active" role, so URL
  // manipulation can't escalate access — Part 6) contains a role permitted
  // into that section.
  if (nextUrl.pathname.startsWith("/admin")) {
    if (!hasAnyRole(roles, ADMIN_APP_ROLES)) {
      return NextResponse.redirect(new URL("/unauthorized", nextUrl));
    }
    return NextResponse.next();
  }

  if (nextUrl.pathname.startsWith("/farmer")) {
    if (!hasAnyRole(roles, FARMER_APP_ROLES)) {
      return NextResponse.redirect(new URL("/unauthorized", nextUrl));
    }
    return NextResponse.next();
  }

  // Everything else is the existing Operator shell (root + its pre-Phase-1
  // routes) — unchanged admin/operator gate, except a Farmer-only profile
  // is sent to its own section instead of the generic unauthorized page.
  if (!hasAnyRole(roles, OPERATOR_APP_ROLES)) {
    if (hasAnyRole(roles, FARMER_APP_ROLES)) {
      return NextResponse.redirect(new URL("/farmer", nextUrl));
    }
    return NextResponse.redirect(new URL("/unauthorized", nextUrl));
  }

  return NextResponse.next();
});

export default middleware;

// `/models/*` (public/models/*.glb, the Digital Twin's
// static 3D assets) was NOT excluded here, so every model fetch went
// through the same section-gating as a page navigation above. Those assets
// aren't farm-specific or sensitive (shared geometry — a tractor, a wheat
// field — identical for every farm/session), but a Farmer-only session
// requesting e.g. `/models/wheat-field.glb` fell into the "everything else
// is the Operator shell" branch (the path isn't `/farmer`-prefixed) and got
// redirected to `/farmer` instead of the binary — GLTFLoader then received
// that HTML page and failed trying to parse it as glTF JSON ("Could not
// load /models/wheat-field.glb:... unexpected character..."). Excluding
// `models/` here, the same way `_next/static`/`_next/image` already are,
// makes the fix a static, public-asset path exactly like those — no auth
// check, no role branching, nothing to keep in sync with the logic above.
//
// `agrinexus-logo.png`
// (`public/agrinexus-logo.png`, the Farmer header's brand mark) hit the
// EXACT same bug class, confirmed live before this exclusion was added:
// Next's `<Image>` requests it through `/_next/image?url=...` (already
// excluded above), but that optimizer's own server-side fetch of the
// underlying `/agrinexus-logo.png` file re-entered this SAME middleware —
// for a Farmer-only session that path isn't `/farmer`-prefixed, so it hit
// the "everything else is the Operator shell" branch and got redirected,
// and the optimizer returned a 400 (confirmed: a real Playwright check
// measured `naturalWidth: 0` and the exact `/_next/image?...` request
// returning 400 before this line existed). Same fix, same reasoning as
// `models/` immediately above: a public, non-farm-specific, non-sensitive
// static asset, excluded from page-level gating exactly like a favicon.
//
// `agrinexus-text.png`
// (`public/agrinexus-text.png`, the official brand-text image now used
// beside the circular mark in both the Farmer header and the Operator
// sidebar/drawer) is the same class of public, non-farm-specific static
// asset as `agrinexus-logo.png` immediately above, added preemptively for
// the identical reason rather than waiting to reproduce the same 400 live.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|agrinexus-logo.png|agrinexus-text.png|models/|api/auth).*)"],
};
