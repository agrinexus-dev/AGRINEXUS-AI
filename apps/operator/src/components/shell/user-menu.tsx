"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Settings, Sprout, Tractor, User } from "lucide-react";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { Avatar, AvatarFallback, cn, Divider } from "@agrinexus/ui";

import type { AppSessionUser } from "@/lib/auth/types";

/**
 * Farmer/Operator switching. Only ever offers a section
 * the profile's own `roles` actually contains (server-issued on the JWT at
 * sign-in — see auth.config.ts), and never the section already open. This
 * is a plain navigation, not a role mutation: every request to either
 * section is independently re-checked by `middleware.ts` against the same
 * `roles` claim, so this menu is a convenience, not a trust boundary.
 *
 * Renders each item as `asChild` around a plain `<a>` — deliberately NOT
 * `next/link`'s `<Link>` and NOT `onSelect={() => router.push(...)}`
 * (also the pre-existing pattern the "Preferences" item below used). Live
 * testing found BOTH of those soft-navigation forms intermittently abort
 * their RSC request (`net::ERR_ABORTED`) when fired from inside a Radix
 * `DropdownMenu.Item` in this app's dev environment — reproduced even on
 * the untouched pre-existing "Preferences" item, so it isn't specific to
 * this new code. A real `<a>` forces a full hard navigation, which cannot
 * be raced/cancelled by anything client-side; switching sections is an
 * infrequent, deliberate action, so the reload cost is a reasonable
 * trade for a navigation that can't silently no-op. "Preferences" was
 * switched to match for the same reason.
 */
function RoleSwitcherItems({ roles }: { roles: AppSessionUser["roles"] }) {
  const pathname = usePathname();
  const inFarmerSection = pathname?.startsWith("/farmer") ?? false;
  const items: { label: string; href: string; icon: typeof Sprout }[] = [];

  if (!inFarmerSection && roles.includes("farmer")) {
    items.push({ label: "Switch to Farmer", href: "/farmer", icon: Sprout });
  }
  if (inFarmerSection && (roles.includes("operator") || roles.includes("admin"))) {
    items.push({ label: "Switch to Operator", href: "/", icon: Tractor });
  }

  if (items.length === 0) return null;

  return (
    <>
      {items.map((item) => (
        <DropdownMenuPrimitive.Item
          key={item.href}
          asChild
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground-muted outline-none",
            // UI-UPGRADE.2 — was `bg-white/[...]`; see Button.tsx's identical fix.
            "data-[highlighted]:bg-foreground/[var(--opacity-hover)] data-[highlighted]:text-foreground",
          )}
        >
          <a href={item.href}>
            <item.icon className="size-4" aria-hidden />
            {item.label}
          </a>
        </DropdownMenuPrimitive.Item>
      ))}
      <Divider className="my-1" />
    </>
  );
}

/**
 * `signOut({ callbackUrl: "/login" })`'s own default redirect
 * (an internal `window.location.href = data.url` inside `next-auth/react`,
 * run only after its own CSRF-protected POST to `/api/auth/signout`
 * resolves) proved unreliable specifically under `next dev --turbopack`:
 * live testing found the POST always succeeds and always clears the
 * session cookie (verified via `document.cookie` after each run — sign-out
 * genuinely invalidates the session every time, in dev and in a production
 * build alike), but in dev mode the library's own follow-up navigation
 * intermittently never fires, leaving the stale authenticated page on
 * screen even though the session underneath it is already gone. The exact
 * same code against `next build`+`next start` (no dev-mode HMR/Strict-Mode
 * client involved) navigated correctly on every run — so this is a
 * dev-server-only navigation-timing artifact, not a defect in Auth.js's
 * CSRF handling or the session/cookie architecture, and nothing about
 * cookies, CSRF, or the JWT/session config changes here.
 *
 * The fix: skip `signOut()`'s own internal redirect (`redirect: false`)
 * and own the navigation explicitly ourselves, in a `finally` so it still
 * fires even if the request itself fails — a full `window.location.href`
 * assignment (never a client-side router transition, which proved
 * unreliable from inside a Radix `DropdownMenu.Item` for the same
 * class of reason) is the one part of this flow now fully under this
 * app's own control rather than delegated to a library-internal step.
 */
async function handleSignOut(): Promise<void> {
  try {
    await signOut({ redirect: false });
  } finally {
    window.location.href = "/login";
  }
}

/**
 * A single Radix DropdownMenu primitive kept app-local (not part of the
 * shared design system, which has no dropdown menu primitive yet). Reads the
 * current session for display and wires a real sign-out action; "Profile"
 * remains a static label — no destination exists for it yet.
 */
export function UserMenu() {
  const { data: session } = useSession();
  const user = session?.user as AppSessionUser | undefined;
  const displayName = user?.name ?? "Operator Account";
  const role = user?.role;
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 items-center gap-2 rounded-md px-1.5",
            // UI-UPGRADE.2 — was `hover:bg-white/[...]`; see Button.tsx's identical fix.
            "transition-colors duration-(--duration-fast) ease-standard hover:bg-foreground/[var(--opacity-hover)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          <Avatar className="size-7">
            <AvatarFallback>{initials || "OA"}</AvatarFallback>
          </Avatar>
          <ChevronDown className="size-3.5 text-foreground-subtle" aria-hidden />
          <span className="sr-only">Open account menu</span>
        </button>
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-(--z-popover) w-56 rounded-lg border border-border bg-surface-elevated p-1.5 shadow-elevated",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="px-2.5 py-2">
            <p className="text-sm font-medium text-foreground">{displayName}</p>
            <p className="text-xs capitalize text-foreground-subtle">
              {role ? `${role} · AgriNexus` : "AgriNexus"}
            </p>
          </div>

          <Divider className="my-1" />

          <RoleSwitcherItems roles={user?.roles ?? (role ? [role] : [])} />

          <DropdownMenuPrimitive.Item
            className={cn(
              "flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground-muted outline-none",
              // UI-UPGRADE.2 — was `bg-white/[...]`; see Button.tsx's identical fix.
              "data-[highlighted]:bg-foreground/[var(--opacity-hover)] data-[highlighted]:text-foreground",
            )}
          >
            <User className="size-4" aria-hidden />
            Profile
          </DropdownMenuPrimitive.Item>

          <DropdownMenuPrimitive.Item
            asChild
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground-muted outline-none",
              // UI-UPGRADE.2 — was `bg-white/[...]`; see Button.tsx's identical fix.
              "data-[highlighted]:bg-foreground/[var(--opacity-hover)] data-[highlighted]:text-foreground",
            )}
          >
            <a href="/settings">
              <Settings className="size-4" aria-hidden />
              Preferences
            </a>
          </DropdownMenuPrimitive.Item>

          <Divider className="my-1" />

          <DropdownMenuPrimitive.Item
            onSelect={() => void handleSignOut()}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-critical outline-none",
              "data-[highlighted]:bg-critical-muted",
            )}
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </DropdownMenuPrimitive.Item>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
