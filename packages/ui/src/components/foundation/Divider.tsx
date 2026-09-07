import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "@/lib/utils";

export type DividerProps = React.ComponentPropsWithRef<typeof SeparatorPrimitive.Root>;

export function Divider({ className, orientation = "horizontal", decorative = true, ref, ...props }: DividerProps) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      orientation={orientation}
      decorative={decorative}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
