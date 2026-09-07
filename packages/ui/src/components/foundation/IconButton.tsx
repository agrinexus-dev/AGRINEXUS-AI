import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center rounded-md",
    "transition-colors duration-(--duration-fast) ease-standard",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-(--opacity-disabled)",
  ].join(" "),
  {
    variants: {
      intent: {
        primary: "bg-accent text-accent-foreground hover:bg-accent/90",
        secondary: "bg-surface-elevated text-foreground border border-border hover:bg-surface-elevated/70",
        // UI-UPGRADE.2 — see `Button.tsx`'s identical fix for the full
        // reasoning: `--color-foreground` self-corrects per theme where a
        // literal `white` overlay only worked for dark surfaces.
        ghost: "text-foreground-muted hover:bg-foreground/[var(--opacity-hover)] hover:text-foreground",
      },
      size: {
        sm: "size-7 [&_svg]:size-3.5",
        md: "size-9 [&_svg]:size-4",
        lg: "size-11 [&_svg]:size-5",
      },
    },
    defaultVariants: {
      intent: "ghost",
      size: "md",
    },
  },
);

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  asChild?: boolean;
  /** Required — an icon-only control must always have an accessible name. */
  "aria-label": string;
  icon: ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
}

export function IconButton({ className, intent, size, asChild = false, icon, ref, ...props }: IconButtonProps) {
  const Component = asChild ? Slot : "button";

  return (
    <Component ref={ref} className={cn(iconButtonVariants({ intent, size }), className)} {...props}>
      {icon}
    </Component>
  );
}

export { iconButtonVariants };
