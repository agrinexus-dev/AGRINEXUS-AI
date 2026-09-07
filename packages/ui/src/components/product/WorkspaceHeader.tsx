import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Typography } from "../foundation/Typography";

export interface WorkspaceHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Heads a top-level workspace (Mission Control, Digital Twin, Drone Operations, …).
 * Presentational only — does not render a sidebar, navigation, or routing of any kind.
 */
export function WorkspaceHeader({ title, subtitle, icon, actions, className }: WorkspaceHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4 border-b border-border-subtle pb-4", className)}>
      <div className="flex items-center gap-3">
        {icon ? (
          <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-surface-elevated text-foreground [&_svg]:size-5" aria-hidden>
            {icon}
          </span>
        ) : null}
        <div className="flex flex-col gap-0.5">
          <Typography variant="h1">{title}</Typography>
          {subtitle ? <Typography variant="small">{subtitle}</Typography> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
