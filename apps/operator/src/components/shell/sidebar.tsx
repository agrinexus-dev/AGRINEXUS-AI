"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";

import { cn, Divider, IconButton, tokens } from "@agrinexus/ui";

import { SidebarNav } from "./sidebar-nav";

export interface SidebarProps {
  activeId: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

const EXPANDED_WIDTH = 248;
const COLLAPSED_WIDTH = 72;

/**
 * Desktop/tablet navigation rail. Hidden below the `lg` breakpoint — see
 * ResponsiveSidebar, which swaps this for a Drawer at that width.
 */
export function Sidebar({ activeId, onSelect, collapsed, onToggleCollapse, className }: SidebarProps) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={{ duration: tokens.motionDuration.slow / 1000, ease: tokens.motionEasing.standard }}
      className={cn(
        "hidden shrink-0 flex-col border-r border-border bg-surface lg:flex",
        className,
      )}
    >
      <div className={cn("flex h-16 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
        {/*
          MVP-UI.1-E (Operator addition) — the official AgriNexus mark
          (`public/agrinexus-logo.png`, the SAME canonical asset the Farmer
          shell uses — see that milestone's own report) replaces the
          temporary `Leaf`-icon-in-a-tinted-box placeholder. It already has
          its own transparent circular design, so no wrapping
          background/shape is added — unlike the old placeholder, which
          needed the tinted box to read as a mark at all. Sized `size-8` to
          match this badge's EXISTING footprint exactly (Operator's own
          32px, distinct from Farmer's 36px — each shell's pre-existing
          size is preserved, not forced to match the other). Rendered
          unconditionally (not inside the `!collapsed` branch below) since
          the old badge was too — the collapsed rail shows just the mark,
          same as before.
        */}
        <Image src="/agrinexus-logo.png" alt="" width={310} height={311} className="size-8 shrink-0" priority />
        {/*
          MVP-UI.1-E.1 (Official AgriNexus Brand Lockup) — same canonical
          `public/agrinexus-text.png` the Farmer header now uses (one
          asset, no per-shell copy — see that file's own doc comment for
          the transparency/aspect-ratio verification), replacing the plain
          "AgriNexus" heading here. `h-6` keeps it comfortably inside this
          rail's own 248px expanded width alongside the 32px logo;
          `object-contain` preserves its ratio, never crops/stretches it.
          Still gated behind `!collapsed`, exactly like the text it
          replaces — the collapsed rail continues to show only the mark.
        */}
        {/*
          MVP-UI.1-E.2 (Optical Alignment Correction) — `translate-y-[4.6%]`:
          the source PNG's visible artwork sits asymmetrically inside its
          own canvas (22px transparent margin above it, 35px below,
          measured by decoding the PNG's alpha channel — see
          `farmer-shell.tsx`'s identical doc comment for the full
          measurement). Centering the canvas therefore visibly centers the
          artwork slightly high; this nudges it down by that same
          measured, height-relative fraction. `%` scales with `h-6`
          automatically, no separate pixel value needed.
        */}
        {!collapsed ? (
          <Image
            src="/agrinexus-text.png"
            alt="AgriNexus"
            width={598}
            height={142}
            className="h-6 w-auto translate-y-[4.6%] shrink-0 object-contain"
            priority
          />
        ) : null}
      </div>

      <Divider />

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav activeId={activeId} onSelect={onSelect} collapsed={collapsed} />
      </div>

      <Divider />

      <div className={cn("flex items-center p-3", collapsed && "justify-center")}>
        <IconButton
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          icon={collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          intent="ghost"
          size="sm"
          onClick={onToggleCollapse}
        />
      </div>
    </motion.aside>
  );
}
