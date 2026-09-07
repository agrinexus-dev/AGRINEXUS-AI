"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";

import { TooltipProvider } from "@agrinexus/ui";

import { useMissionSimulation } from "@/lib/missions/use-mission-simulation";
import { useRobotMissionSimulation } from "@/lib/robot-missions/use-robot-mission-simulation";
import { useHistoricalStoreHydration } from "@/lib/sensor-analytics/historical-store";

import { ResponsiveSidebar } from "./responsive-sidebar";
import { sidebarNavItems } from "./sidebar-nav-items";
import { WorkspaceLayout } from "./workspace-layout";

// Lazy-loaded (`ssr: false`) so AURA's bundle (react-markdown, its chat/settings
// stores) only loads once this mounts on the client — it never adds to the
// shell's own initial load.
const AuraMount = dynamic(() => import("@/components/aura/aura-mount"), { ssr: false });

export interface AppShellProps {
  children: ReactNode;
}

/**
 * The reusable desktop application shell for the Operator app: sidebar,
 * top navigation, and a content region. Owns shell-local UI state (collapse
 * state, mobile drawer open state) plus nav selection — no farm data, no
 * business logic. Selection is local state EXCEPT for entries with a real
 * `href` (see sidebar-nav-items.ts): for those, the current route wins so
 * the sidebar stays correct when a page is reached by any path (a Command
 * Center button, a direct link), not only a sidebar click.
 */
// `sidebarNavItems` is a fixed, non-empty module-level constant.
const DEFAULT_NAV_ITEM = sidebarNavItems[0]!;

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [localActiveId, setLocalActiveId] = useState(DEFAULT_NAV_ITEM.id);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Rehydrates the Historical Sensor Store from `localStorage` once the
  // client has mounted — not business logic,
  // just store plumbing every `(shell)` page needs exactly once; see that
  // store's own `skipHydration`/`useHistoricalStoreHydration` doc comments.
  useHistoricalStoreHydration();

  // AURA Natural-Language-Actions phase, mission-reliability fix —
  // moved here from being mounted only inside `digital-twin-page.tsx`/
  // `missions-page.tsx`/`robot-missions-page.tsx`. Both hooks are plain
  // `useEffect`+`setInterval` logic with no 3D/Canvas dependency (confirmed
  // by inspection — see each hook's own file), so mounting them once here
  // keeps every in-flight mission progressing regardless of which Operator
  // page is open, instead of stalling the moment the operator navigates away
  // from Digital Twin/a Mission Planner page. Removed from those 3 pages so
  // they aren't ticked twice as fast.
  useMissionSimulation();
  useRobotMissionSimulation();

  const routedActiveId = useMemo(
    () => sidebarNavItems.find((item) => item.href === pathname)?.id,
    [pathname],
  );
  const activeId = routedActiveId ?? localActiveId;

  const activeItem = useMemo(
    () => sidebarNavItems.find((item) => item.id === activeId) ?? DEFAULT_NAV_ITEM,
    [activeId],
  );

  // Warms every real route's JS/RSC payload ahead of a click — any future
  // nav item that gains a real `href` benefits from this
  // automatically, no change needed here.
  useEffect(() => {
    for (const item of sidebarNavItems) {
      if (item.href) router.prefetch(item.href);
    }
  }, [router]);

  function handleSelect(id: string) {
    setLocalActiveId(id);
    const item = sidebarNavItems.find((candidate) => candidate.id === id);
    if (item?.href) {
      router.push(item.href);
    }
  }

  const breadcrumbs = useMemo(
    () => [{ label: "AgriNexus" }, { label: activeItem.label }],
    [activeItem],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
        <ResponsiveSidebar
          activeId={activeId}
          onSelect={handleSelect}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          mobileOpen={mobileNavOpen}
          onMobileOpenChange={setMobileNavOpen}
        />
        <WorkspaceLayout
          workspaceName={activeItem.label}
          breadcrumbs={breadcrumbs}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        >
          {children}
        </WorkspaceLayout>

        <AuraMount />
      </div>
    </TooltipProvider>
  );
}
