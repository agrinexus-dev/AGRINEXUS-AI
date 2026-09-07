import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

export type TrendDirection = "up" | "down" | "flat";

/** Shared trend glyph + color used by TelemetryCard, MetricTile, and KpiCard. */
export function TrendIndicator({ direction, className }: { direction: TrendDirection; className?: string }) {
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  const color =
    direction === "up" ? "text-success" : direction === "down" ? "text-critical" : "text-foreground-subtle";

  return <Icon className={cn("size-3.5", color, className)} aria-hidden />;
}
