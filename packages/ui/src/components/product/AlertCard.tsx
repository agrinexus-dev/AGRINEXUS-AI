import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Panel } from "../foundation/Panel";
import { StatusBadge, type Status } from "../foundation/StatusBadge";
import { Typography } from "../foundation/Typography";

export interface AlertCardProps {
  severity: Status;
  title: string;
  description?: string;
  timestamp?: string;
  action?: ReactNode;
  className?: string;
}

export function AlertCard({ severity, title, description, timestamp, action, className }: AlertCardProps) {
  return (
    <Panel variant="default" padding="md" className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Typography variant="h4">{title}</Typography>
          {timestamp ? <Typography variant="caption">{timestamp}</Typography> : null}
        </div>
        <StatusBadge status={severity} />
      </div>
      {description ? <Typography variant="small">{description}</Typography> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </Panel>
  );
}
