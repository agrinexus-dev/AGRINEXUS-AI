import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "text-sm font-medium transition-colors duration-(--duration-fast) ease-standard",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-(--opacity-disabled)",
  ].join(" "),
  {
    variants: {
      intent: {
        primary: "bg-accent text-accent-foreground hover:bg-accent/90",
        secondary: "bg-surface-elevated text-foreground border border-border hover:bg-surface-elevated/70",
        // UI-UPGRADE.2 — was `hover:bg-white/[var(--opacity-hover)]`: a
        // literal white overlay lightens a dark surface correctly but reads
        // as a near-invisible white-on-white smear on a light one. Mixing
        // toward `--color-foreground` instead self-corrects per theme: dark
        // mode's foreground is near-white (unchanged visual result), light
        // mode's foreground is near-black (a real, visible darkening hover
        // — the same fix applied everywhere this exact pattern occurred).
        ghost: "text-foreground hover:bg-foreground/[var(--opacity-hover)]",
        outline: "border border-border text-foreground hover:bg-foreground/[var(--opacity-hover)]",
        destructive: "bg-critical text-critical-foreground hover:bg-critical/90",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-base",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: {
      intent: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({
  className,
  intent,
  size,
  asChild = false,
  loading = false,
  disabled,
  leadingIcon,
  trailingIcon,
  children,
  ref,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";

  return (
    <Component
      ref={ref}
      className={cn(buttonVariants({ intent, size }), className)}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : leadingIcon}
      {children}
      {!loading ? trailingIcon : null}
    </Component>
  );
}

export { buttonVariants };
