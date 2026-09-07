import { Menu } from "lucide-react";
import Image from "next/image";

import { Divider, IconButton, Typography } from "@agrinexus/ui";

import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";
import { NotificationBell } from "./notification-bell";
import { SearchButton } from "./search-button";
import { UserMenu } from "./user-menu";

export interface TopNavProps {
  workspaceName: string;
  breadcrumbs: BreadcrumbItem[];
  onOpenMobileNav: () => void;
}

export function TopNav({ workspaceName, breadcrumbs, onOpenMobileNav }: TopNavProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface/60 px-4 backdrop-blur-xl md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <IconButton
          aria-label="Open navigation"
          icon={<Menu />}
          intent="ghost"
          size="md"
          className="lg:hidden"
          onClick={onOpenMobileNav}
        />

        {/*
          MVP-UI.1-E.1 (Official AgriNexus Brand Lockup) — this is a THIRD,
          separate "AgriNexus" text occurrence found in the Operator shell
          (distinct from `Sidebar`'s own desktop-rail heading and
          `ResponsiveSidebar`'s mobile-drawer title): this top bar's own
          inline heading, shown below `lg` — i.e. exactly on the phone/
          tablet widths where `Sidebar`'s rail is hidden, so this is what a
          mobile Operator session actually sees in its persistent header,
          not the drawer (which only appears once tapped). Same canonical
          `public/agrinexus-text.png`, no per-shell copy. `h-5` keeps its
          footprint close to the `h4` text it replaces so `workspaceName`'s
          existing `truncate` continues to absorb any width difference on
          a narrow phone exactly as it already did for the text.
        */}
        {/*
          MVP-UI.1-E.2 (Optical Alignment Correction) — same measured
          `translate-y-[4.6%]` nudge as `Sidebar`'s identical image (see
          that file's own doc comment for the alpha-channel measurement
          this is based on).
        */}
        <Image
          src="/agrinexus-text.png"
          alt="AgriNexus"
          width={598}
          height={142}
          className="h-5 w-auto translate-y-[4.6%] shrink-0 object-contain lg:hidden"
          priority
        />

        <Divider orientation="vertical" className="h-5 lg:hidden" />

        <Typography as="span" variant="body" className="truncate font-medium">
          {workspaceName}
        </Typography>

        <Breadcrumbs items={breadcrumbs} className="ml-1" />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <SearchButton className="hidden md:flex" />
        <NotificationBell />
        <Divider orientation="vertical" className="h-5" />
        <UserMenu />
      </div>
    </header>
  );
}
