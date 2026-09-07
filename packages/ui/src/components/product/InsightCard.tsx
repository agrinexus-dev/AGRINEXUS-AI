import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Badge } from "../foundation/Badge";
import { Panel } from "../foundation/Panel";
import { Typography } from "../foundation/Typography";

export interface InsightCardProps {
  title: string;
  body: string;
  tag?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** A single AURA-generated prediction or recommendation, rendered as a passive surface — AURA itself decides content. */
export function InsightCard({ title, body, tag, icon, action, className }: InsightCardProps) {
  return (
    <Panel variant="glass" padding="md" className={cn("flex gap-3", className)}>
      {icon ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          {tag ? <Badge intent="accent">{tag}</Badge> : null}
          <Typography variant="h4">{title}</Typography>
        </div>
        <Typography variant="small">{body}</Typography>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </Panel>
  );
}
