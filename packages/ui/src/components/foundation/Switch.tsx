import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

export type SwitchProps = React.ComponentPropsWithRef<typeof SwitchPrimitive.Root>;

/**
 * `dir="ltr"` is the actual fix, not a class. Root-caused via live DOM
 * measurement (see that milestone's own report): the Thumb's UNTRANSFORMED
 * rest position comes from this Root's `items-center` flex layout, whose
 * main-axis start flips sides under an ambient `dir="rtl"` (e.g. the Farmer
 * shell in Urdu) — while the Thumb's own `translate-x-4`/`translate-x-0.5`
 * (below) is a physical CSS transform that never respects `direction` at
 * all. Under RTL those two combine and the thumb was measured overflowing
 * the track by 15px. Pinning this ONE shared component's own internal
 * `dir` to `ltr` makes its flex layout direction-independent, so the
 * existing transform values behave identically no matter what direction
 * the PAGE around it is in — geometry (track/thumb size, alignment) is
 * IDENTICAL in English and Urdu, which the instruction
 * prioritizes over mirroring the thumb's semantic on/off side. Every
 * consumer (Farmer Settings, any future Operator/Farmer toggle) gets this
 * for free — no per-page fix, no duplicated component.
 */
export function Switch({ className, ref, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent",
        "transition-colors duration-(--duration-fast) ease-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-(--opacity-disabled)",
        "data-[state=checked]:bg-accent data-[state=unchecked]:bg-surface-elevated",
        className,
      )}
      {...props}
      // Spread AFTER `{...props}` so no consumer (accidentally or
      // otherwise) can override this — this component's internal geometry
      // must stay direction-independent unconditionally, per this
      // milestone's own "no page-specific switch hacks" requirement.
      dir="ltr"
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block size-4 rounded-full bg-foreground shadow-sm ring-0",
          "transition-transform duration-(--duration-fast) ease-standard",
          "data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
