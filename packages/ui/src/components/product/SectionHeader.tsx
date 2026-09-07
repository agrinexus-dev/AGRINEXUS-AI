import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Typography } from "../foundation/Typography";

export interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

/** Heads a section within a workspace. Presentational only — no navigation or routing. */
export function SectionHeader({ title, description, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex flex-col gap-1">
        <Typography variant="h3">{title}</Typography>
        {description ? <Typography variant="small">{description}</Typography> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
