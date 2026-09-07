"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@agrinexus/ui";

import { widgetRegistry } from "@/lib/workspace/registry";
import { useWorkspace } from "@/lib/workspace/workspace-context";

import { PlaceholderWidgetBody } from "./placeholder-widget";

/**
 * Reuses the `Dialog` primitive (Radix under the hood) purely for its focus
 * trap, Escape-to-close, and portal behavior — visually it's overridden to
 * fill the viewport rather than look like a centered modal card.
 */
export function FullscreenOverlay() {
  const { fullscreenId, exitFullscreen } = useWorkspace();
  const definition = fullscreenId ? widgetRegistry[fullscreenId] : null;

  return (
    <Dialog open={definition !== null} onOpenChange={(open) => !open && exitFullscreen()}>
      {definition && (
        <DialogContent className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col rounded-none">
          <DialogHeader className="flex-row items-center gap-2 space-y-0">
            <definition.icon className="size-5 text-foreground-muted" aria-hidden />
            <DialogTitle>{definition.title}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            {definition.component ? <definition.component /> : <PlaceholderWidgetBody icon={definition.icon} />}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
