import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * A small, semantic
 * variant set added to address the audit's own "repetitive card design"
 * finding (MVP-UI.1-A): every card in the app previously used
 * this exact same treatment regardless of role. `default` is BYTE-FOR-BYTE
 * the previous (only) styling, so every existing call site is unaffected
 * unless it opts into a new variant. Hierarchy is communicated through
 * surface/border/shadow/radius only — never decoration — per that
 * milestone's own "not through excessive decoration" instruction. Every
 * value below is an existing semantic token (`--color-*`/`--shadow-*`),
 * never a raw color, so this stays dark-mode-ready without any further
 * change once a dark palette exists (MVP-UI.1-A).
 */
const cardVariants = cva("rounded-lg", {
  variants: {
    variant: {
      /** The original, only-ever treatment — unchanged. */
      default: "border border-border bg-surface shadow-panel",
      /** Flatter than `default` — a border only, no shadow. For dense list/row groupings where many adjacent cards would otherwise stack redundant shadows. */
      flat: "border border-border bg-surface",
      /** Stronger presence than `default` — for a page's one or two most important surfaces (e.g. a primary entry point), not for routine content. */
      elevated: "border border-border bg-surface-elevated shadow-elevated",
      /** No border/shadow at all — a surface-colored recess, for content nested inside another card/panel rather than sitting directly on the page background. */
      inset: "bg-surface-elevated",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {
  ref?: React.Ref<HTMLDivElement>;
}

export function Card({ className, variant, ref, ...props }: CardProps) {
  return <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />;
}

export { cardVariants };

export function CardHeader({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("flex flex-col gap-1 p-4", className)} {...props} />;
}

export function CardTitle({ className, ref, ...props }: HTMLAttributes<HTMLHeadingElement> & { ref?: React.Ref<HTMLHeadingElement> }) {
  return <h3 ref={ref} className={cn("text-md font-medium text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ref, ...props }: HTMLAttributes<HTMLParagraphElement> & { ref?: React.Ref<HTMLParagraphElement> }) {
  return <p ref={ref} className={cn("text-sm text-foreground-muted", className)} {...props} />;
}

export function CardContent({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("flex items-center gap-2 p-4 pt-0", className)} {...props} />;
}
