import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin/admin-shell";

/**
 * Everything under `/admin` is already known — by `middleware.ts` — to
 * belong to a session whose `roles` includes `admin`.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
