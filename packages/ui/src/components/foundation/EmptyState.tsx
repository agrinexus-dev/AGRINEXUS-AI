import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Typography } from "./Typography";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-subtle px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="flex size-10 items-center justify-center rounded-full bg-surface-elevated text-foreground-muted [&_svg]:size-5" aria-hidden>
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        <Typography variant="h4">{title}</Typography>
        {description ? (
          <Typography variant="small" className="max-w-sm">
            {description}
          </Typography>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
