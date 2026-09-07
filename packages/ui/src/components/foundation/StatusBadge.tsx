import type { HTMLAttributes } from "react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Badge } from "./Badge";

export type Status = "nominal" | "attention" | "critical" | "offline" | "info";

const statusToIntent: Record<Status, "success" | "warning" | "critical" | "neutral" | "accent"> = {
  nominal: "success",
  attention: "warning",
  critical: "critical",
  offline: "neutral",
  info: "accent",
};

const dotVariants = cva("size-1.5 rounded-full", {
  variants: {
    status: {
      nominal: "bg-success",
      attention: "bg-warning",
      critical: "bg-critical animate-pulse",
      offline: "bg-foreground-subtle",
      info: "bg-accent",
    } satisfies Record<Status, string>,
  },
});

const defaultLabel: Record<Status, string> = {
  nominal: "Nominal",
  attention: "Attention",
  critical: "Critical",
  offline: "Offline",
  info: "Info",
};

export interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  status: Status;
  label?: string;
  ref?: React.Ref<HTMLSpanElement>;
}

export function StatusBadge({ status, label, className, ref, ...props }: StatusBadgeProps) {
  return (
    <Badge intent={statusToIntent[status]} className={cn(className)} ref={ref} {...props}>
      <span className={dotVariants({ status })} aria-hidden />
      {label ?? defaultLabel[status]}
    </Badge>
  );
}
