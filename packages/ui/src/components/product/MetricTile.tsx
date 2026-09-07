import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Typography } from "../foundation/Typography";
import { TrendIndicator, type TrendDirection } from "./shared/trend";

export interface MetricTileProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: ReactNode;
  trend?: TrendDirection;
  className?: string;
}

/** Compact metric used in dense grids — lighter-weight than TelemetryCard, no header row. */
export function MetricTile({ label, value, unit, icon, trend, className }: MetricTileProps) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface/60 p-3", className)}>
      <div className="flex items-center gap-1.5 text-foreground-subtle">
        {icon ? (
          <span className="flex [&_svg]:size-3.5" aria-hidden>
            {icon}
          </span>
        ) : null}
        <Typography variant="caption">{label}</Typography>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-lg font-semibold text-foreground">{value}</span>
        {unit ? <span className="text-xs text-foreground-muted">{unit}</span> : null}
        {trend ? <TrendIndicator direction={trend} className="ml-auto" /> : null}
      </div>
    </div>
  );
}
