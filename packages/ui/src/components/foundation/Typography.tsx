import type { ComponentPropsWithRef, ElementType, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const typographyVariants = cva("text-foreground", {
  variants: {
    variant: {
      display: "text-3xl font-semibold tracking-tight",
      h1: "text-2xl font-semibold tracking-tight",
      h2: "text-xl font-semibold tracking-tight",
      h3: "text-lg font-medium",
      h4: "text-md font-medium",
      body: "text-base font-regular text-foreground",
      bodyMuted: "text-base font-regular text-foreground-muted",
      small: "text-sm font-regular text-foreground-muted",
      caption: "text-xs font-medium uppercase tracking-wide text-foreground-subtle",
      mono: "font-mono text-sm text-foreground",
    },
  },
  defaultVariants: {
    variant: "body",
  },
});

const defaultElement: Record<
  NonNullable<VariantProps<typeof typographyVariants>["variant"]>,
  ElementType<ComponentPropsWithRef<"p">>
> = {
  display: "h1",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  body: "p",
  bodyMuted: "p",
  small: "p",
  caption: "span",
  mono: "span",
};

export interface TypographyProps
  extends Omit<ComponentPropsWithRef<"p">, "children">,
    VariantProps<typeof typographyVariants> {
  as?: ElementType<ComponentPropsWithRef<"p">>;
  children?: ReactNode;
}

export function Typography({ as, variant = "body", className, children, ref, ...props }: TypographyProps) {
  const Component = as ?? defaultElement[variant ?? "body"];

  return (
    <Component ref={ref} className={cn(typographyVariants({ variant }), className)} {...props}>
      {children}
    </Component>
  );
}

export { typographyVariants };
