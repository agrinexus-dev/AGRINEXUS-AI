import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "../foundation/Card";
import { Typography } from "../foundation/Typography";
import { TrendIndicator, type TrendDirection } from "./shared/trend";

export interface TelemetryCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: ReactNode;
  trend?: TrendDirection;
  trendLabel?: string;
  className?: string;
}

export function TelemetryCard({ label, value, unit, icon, trend, trendLabel, className }: TelemetryCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <Typography variant="caption">{label}</Typography>
        {icon ? (
          <span className="flex text-foreground-subtle [&_svg]:size-4" aria-hidden>
            {icon}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold text-foreground">{value}</span>
        {unit ? <span className="text-sm text-foreground-muted">{unit}</span> : null}
        {trend ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-foreground-muted">
            <TrendIndicator direction={trend} />
            {trendLabel}
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}
