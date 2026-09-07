import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

export function Drawer({ direction = "right", ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root direction={direction} {...props} />;
}

export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerClose = DrawerPrimitive.Close;
export const DrawerPortal = DrawerPrimitive.Portal;

export function DrawerOverlay({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DrawerPrimitive.Overlay>) {
  return <DrawerPrimitive.Overlay ref={ref} className={cn("fixed inset-0 z-(--z-overlay) bg-overlay", className)} {...props} />;
}

const directionClass: Record<"top" | "bottom" | "left" | "right", string> = {
  top: "inset-x-0 top-0 border-b rounded-b-xl",
  bottom: "inset-x-0 bottom-0 border-t rounded-t-xl",
  left: "inset-y-0 left-0 h-full w-full max-w-sm border-r",
  right: "inset-y-0 right-0 h-full w-full max-w-sm border-l",
};

export function DrawerContent({
  className,
  children,
  direction = "right",
  container,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DrawerPrimitive.Content> & {
  direction?: "top" | "bottom" | "left" | "right";
  /**
   * `DrawerPortal` is
   * vaul's own `Portal`, itself Radix's `Dialog.Portal` (see its re-export
   * above), which already accepts a `container` override — nothing new is
   * added to the underlying primitive, just forwarded through. Omitted (the
   * default, every pre-existing call site) behaves exactly as before:
   * Radix's Portal falls back to `document.body` when `container` is
   * undefined. A caller with its OWN themed DOM subtree (a root element
   * that defines a different set of CSS custom properties than `:root`)
   * can pass that element here so this Drawer's overlay/content mount
   * inside it instead, and resolve that subtree's tokens rather than the
   * page's global ones.
   */
  container?: HTMLElement | null;
}) {
  return (
    <DrawerPortal container={container}>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-(--z-overlay) flex flex-col border-border bg-surface-elevated shadow-elevated outline-none",
          directionClass[direction],
          className,
        )}
        {...props}
      >
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

export function DrawerHeader({ className, ref, ...props }: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("flex flex-col gap-1 border-b border-border p-5", className)} {...props} />;
}

export function DrawerFooter({ className, ref, ...props }: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("mt-auto flex items-center justify-end gap-2 border-t border-border p-5", className)} {...props} />;
}

export function DrawerTitle({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title ref={ref} className={cn("text-lg font-medium text-foreground", className)} {...props} />;
}

export function DrawerDescription({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DrawerPrimitive.Description>) {
  return <DrawerPrimitive.Description ref={ref} className={cn("text-sm text-foreground-muted", className)} {...props} />;
}
