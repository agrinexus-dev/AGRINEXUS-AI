import type { ReactNode } from "react";

import type { BreadcrumbItem } from "./breadcrumbs";
import { ContentArea } from "./content-area";
import { TopNav } from "./top-nav";

export interface WorkspaceLayoutProps {
  workspaceName: string;
  breadcrumbs: BreadcrumbItem[];
  onOpenMobileNav: () => void;
  children: ReactNode;
}

/** The column to the right of the sidebar: top navigation plus the scrollable content area. */
export function WorkspaceLayout({ workspaceName, breadcrumbs, onOpenMobileNav, children }: WorkspaceLayoutProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopNav workspaceName={workspaceName} breadcrumbs={breadcrumbs} onOpenMobileNav={onOpenMobileNav} />
      <ContentArea workspaceName={workspaceName}>{children}</ContentArea>
    </div>
  );
}
