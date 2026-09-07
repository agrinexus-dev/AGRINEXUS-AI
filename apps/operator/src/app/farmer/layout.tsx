import type { ReactNode } from "react";

import { FarmerShell } from "@/components/farmer/farmer-shell";

import "./farmer-theme.css";

/**
 * Everything under `/farmer` is already known — by `middleware.ts` — to
 * belong to a session whose `roles` includes `farmer`, so this layout only
 * mounts chrome, the same division of responsibility as `(shell)/layout.tsx`
 * for Operator.
 */
export default function FarmerLayout({ children }: { children: ReactNode }) {
  return <FarmerShell>{children}</FarmerShell>;
}
