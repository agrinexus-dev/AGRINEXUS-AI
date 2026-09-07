"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useActionBridgeStore } from "@/lib/aura/actions/action-bridge-store";

/**
 * Registers page navigation into the Action Layer's bridge —
 * reuses the SAME `useRouter().push()` every in-app link already uses,
 * nothing new about how routing works. Mounted once from `aura-mount.tsx`,
 * so navigation is available wherever AURA is open, not just on one page.
 */
export function AuraRouterBridge() {
  const router = useRouter();

  useEffect(() => {
    useActionBridgeStore.getState().registerNavigate((path) => router.push(path));
    return () => useActionBridgeStore.getState().unregisterNavigate();
  }, [router]);

  return null;
}
