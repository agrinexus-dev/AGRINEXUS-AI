import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "../foundation/Card";
import { StatusBadge, type Status } from "../foundation/StatusBadge";
import { Typography } from "../foundation/Typography";

export type MissionAssetType = "drone" | "robot";

export interface MissionCardProps {
  title: string;
  assetType: MissionAssetType;
  status: Status;
  /**
   * Overrides the badge's generic bucket word ("Nominal"/"Attention"/"Info")
   * with the mission's own real stage/status text ("Preparing"/"Working"/
   * "Returning"/"Completed"/"Paused"/"Cancelled") — added for the
   * unified AURA mission card, which has a real, more specific
   * status per mission than the generic health-style buckets this component
   * originally shipped with. Omit to keep the original generic label.
   */
  statusLabel?: string;
  field?: string;
  eta?: string;
  /** 0–100. Omit to hide the progress track. */
  progress?: number;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function MissionCard({ title, assetType, status, statusLabel, field, eta, progress, icon, actions, className }: MissionCardProps) {
  return (
    <Card className={cn("flex flex-col gap-0", className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-start gap-3">
          {icon ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-elevated text-foreground-muted [&_svg]:size-4" aria-hidden>
              {icon}
            </span>
          ) : null}
          <div className="flex flex-col gap-0.5">
            <Typography variant="h4">{title}</Typography>
            <Typography variant="caption">{assetType === "drone" ? "Drone Mission" : "Ground Robot Mission"}</Typography>
          </div>
        </div>
        <StatusBadge status={status} label={statusLabel} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {(field || eta) && (
          <div className="flex items-center gap-4 text-sm text-foreground-muted">
            {field ? <span>{field}</span> : null}
            {eta ? <span>ETA {eta}</span> : null}
          </div>
        )}
        {typeof progress === "number" ? (
          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-(--duration-slow) ease-standard"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        ) : null}
        {actions ? <div className="flex items-center gap-2 pt-1">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}
