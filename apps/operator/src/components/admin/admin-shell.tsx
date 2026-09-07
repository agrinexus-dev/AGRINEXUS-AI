import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

import { Typography } from "@agrinexus/ui";

import { UserMenu } from "@/components/shell/user-menu";

/**
 * A deliberately minimal Admin chrome: Admin is a
 * dedicated section (not the Operator shell, not the Farmer shell), but
 * this change's scope is "a clean foundation that can be expanded later",
 * not a full admin console — so this is a header + content area, nothing
 * more. Reuses the existing dark tokens as-is (no scoped theme override
 * the way `/farmer` has — Admin is a utility surface, not a
 * farmer-friendly one).
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-surface-elevated px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-accent-muted text-accent">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          <div>
            <Typography as="span" variant="h4" className="block leading-tight">
              AgriNexus
            </Typography>
            <Typography variant="small" className="text-foreground-subtle">
              Admin Settings
            </Typography>
          </div>
        </div>

        <UserMenu />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-6 py-8">{children}</main>
    </div>
  );
}
