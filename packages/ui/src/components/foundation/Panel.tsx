import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const panelVariants = cva("rounded-xl border", {
  variants: {
    variant: {
      default: "border-border bg-surface",
      elevated: "border-border bg-surface-elevated shadow-elevated",
      subtle: "border-border-subtle bg-surface/60",
      glass: "border-border-subtle bg-surface/40 backdrop-blur-xl",
    },
    padding: {
      none: "p-0",
      sm: "p-3",
      md: "p-5",
      lg: "p-8",
    },
  },
  defaultVariants: {
    variant: "default",
    padding: "md",
  },
});

export interface PanelProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof panelVariants> {
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * Larger structural surface than Card — used to group whole regions of a
 * workspace (a Digital Twin overlay panel, a form section) rather than a
 * single discrete unit of content.
 */
export function Panel({ className, variant, padding, ref, ...props }: PanelProps) {
  return <div ref={ref} className={cn(panelVariants({ variant, padding }), className)} {...props} />;
}

export { panelVariants };
