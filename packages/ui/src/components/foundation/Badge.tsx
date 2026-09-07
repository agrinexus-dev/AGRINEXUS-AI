import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      intent: {
        neutral: "border-border bg-surface-elevated text-foreground-muted",
        accent: "border-transparent bg-accent-muted text-accent",
        success: "border-transparent bg-success-muted text-success",
        warning: "border-transparent bg-warning-muted text-warning",
        critical: "border-transparent bg-critical-muted text-critical",
        outline: "border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      intent: "neutral",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  ref?: React.Ref<HTMLSpanElement>;
}

export function Badge({ className, intent, ref, ...props }: BadgeProps) {
  return <span ref={ref} className={cn(badgeVariants({ intent }), className)} {...props} />;
}

export { badgeVariants };
