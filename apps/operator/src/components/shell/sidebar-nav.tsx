"use client";

import { motion } from "framer-motion";

import { cn, tokens, Tooltip, TooltipContent, TooltipTrigger } from "@agrinexus/ui";

import { sidebarNavItems } from "./sidebar-nav-items";

export interface SidebarNavProps {
  activeId: string;
  onSelect: (id: string) => void;
  collapsed?: boolean;
  className?: string;
  /** Namespaces the animated active-indicator's `layoutId` — the desktop rail and the mobile drawer each render their own `SidebarNav`, and both can be mounted at once (the drawer's content persists in the DOM while closed), so they need distinct groups rather than sharing one `layoutId`. */
  indicatorGroup?: string;
}

const ACTIVE_INDICATOR_TRANSITION = {
  duration: tokens.motionDuration.base / 1000,
  ease: tokens.motionEasing.standard,
};

/**
 * The nav item list shared by the desktop rail and the mobile drawer.
 * Selection is local UI state — no routing exists behind these items yet.
 *
 * The active item's highlight is a single `motion.span` with a shared
 * `layoutId`: Framer Motion animates it sliding from the
 * previous active item to the new one instead of each button's background
 * just snapping on/off, which is what made this feel instant/premium rather
 * than a plain color swap. Hover still uses the existing plain CSS color
 * transition below — already smooth, nothing to change there.
 */
export function SidebarNav({
  activeId,
  onSelect,
  collapsed = false,
  className,
  indicatorGroup = "desktop",
}: SidebarNavProps) {
  return (
    <nav aria-label="Workspaces" className={cn("flex flex-col gap-1", className)}>
      {sidebarNavItems.map((item) => {
        const isActive = item.id === activeId;
        const Icon = item.icon;

        const button = (
          <button
            key={item.id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(item.id)}
            className={cn(
              "group relative flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium",
              "transition-colors duration-(--duration-fast) ease-standard",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              collapsed && "justify-center px-0",
              // UI-UPGRADE.2 — was `hover:bg-white/[...]`; see Button.tsx's
              // identical fix. `--color-foreground` self-corrects per theme.
              isActive
                ? "text-accent"
                : "text-foreground-muted hover:bg-foreground/[var(--opacity-hover)] hover:text-foreground",
            )}
          >
            {isActive ? (
              <motion.span
                layoutId={`sidebar-active-indicator-${indicatorGroup}`}
                className="absolute inset-0 rounded-md bg-accent-muted"
                transition={ACTIVE_INDICATOR_TRANSITION}
              />
            ) : null}
            <Icon className="relative z-10 size-[18px] shrink-0" aria-hidden />
            {!collapsed ? <span className="relative z-10 truncate">{item.label}</span> : null}
          </button>
        );

        if (!collapsed) {
          return button;
        }

        return (
          <Tooltip key={item.id} delayDuration={200}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
