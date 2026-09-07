"use client";

import Image from "next/image";

import { cn, Divider, Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@agrinexus/ui";

import { Sidebar } from "./sidebar";
import { SidebarNav } from "./sidebar-nav";

export interface ResponsiveSidebarProps {
  activeId: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

/**
 * Desktop-first navigation: a collapsible rail at `lg` and above (Sidebar),
 * and a full-height Drawer below it for tablet/mobile. Both render the same
 * SidebarNav so the two never drift out of sync.
 */
export function ResponsiveSidebar({
  activeId,
  onSelect,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileOpenChange,
}: ResponsiveSidebarProps) {
  const handleMobileSelect = (id: string) => {
    onSelect(id);
    onMobileOpenChange(false);
  };

  return (
    <>
      <Sidebar
        activeId={activeId}
        onSelect={onSelect}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />

      <Drawer direction="left" open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DrawerContent direction="left" className="flex w-72 max-w-[85vw] flex-col p-0">
          <DrawerHeader className={cn("flex-row items-center gap-2 border-b-0 py-4")}>
            {/* MVP-UI.1-E (Operator addition) — same official mark, same reasoning as `Sidebar`'s own identical replacement (this drawer duplicates that header's markup for the mobile breakpoint rather than reusing it, so both needed the same fix). */}
            <Image src="/agrinexus-logo.png" alt="" width={310} height={311} className="size-8 shrink-0" priority />
            {/*
              MVP-UI.1-E.1 (Official AgriNexus Brand Lockup) — same
              canonical `public/agrinexus-text.png` used by `Sidebar` and
              the Farmer header (one asset, no per-shell copy), replacing
              the plain `DrawerTitle` text here for the same reason this
              drawer already duplicates `Sidebar`'s logo markup. Wrapped in
              a real (visually hidden) `DrawerTitle` so Radix's Dialog
              still gets its required accessible name — the image itself
              carries the visible brand mark.
            */}
            <DrawerTitle className="sr-only">AgriNexus</DrawerTitle>
            {/*
              MVP-UI.1-E.2 (Optical Alignment Correction) — same measured
              `translate-y-[4.6%]` nudge as `Sidebar`'s identical image
              (see that file's own doc comment for the alpha-channel
              measurement this is based on): the asset's visible artwork
              sits asymmetrically inside its canvas, so centering the
              canvas alone visibly centers it slightly high.
            */}
            <Image
              src="/agrinexus-text.png"
              alt="AgriNexus"
              width={598}
              height={142}
              className="h-6 w-auto translate-y-[4.6%] shrink-0 object-contain"
              priority
            />
          </DrawerHeader>
          <Divider />
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <SidebarNav activeId={activeId} onSelect={handleMobileSelect} indicatorGroup="mobile" />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
