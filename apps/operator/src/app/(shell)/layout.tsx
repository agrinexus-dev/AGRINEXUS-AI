import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";

/**
 * Everything under the `(shell)` route group is already known — by the
 * middleware — to belong to an authenticated `admin`/`operator` session, so
 * this layout only needs to mount the shell chrome, not re-check auth.
 * `/login` and `/unauthorized` live outside this group and never get it.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
