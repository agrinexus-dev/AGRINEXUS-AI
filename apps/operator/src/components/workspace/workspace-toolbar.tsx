"use client";

import { Eye, PresentationIcon, RotateCcw } from "lucide-react";

import { Badge, Button, Divider, Switch, Tooltip, TooltipContent, TooltipTrigger, Typography } from "@agrinexus/ui";

import { widgetRegistry } from "@/lib/workspace/registry";
import { useWorkspace } from "@/lib/workspace/workspace-context";

export function WorkspaceToolbar() {
  const { presentationMode, togglePresentationMode, resetLayout, hiddenOrder, show } = useWorkspace();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2.5">
      <div className="flex items-center gap-2">
        <label htmlFor="presentation-mode" className="flex cursor-pointer items-center gap-2 select-none">
          <PresentationIcon className="size-4 text-foreground-muted" aria-hidden />
          <Typography variant="small">Presentation Mode</Typography>
        </label>
        <Switch id="presentation-mode" checked={presentationMode} onCheckedChange={togglePresentationMode} />
      </div>

      {!presentationMode && (
        <div className="flex flex-wrap items-center gap-3">
          {hiddenOrder.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Typography variant="caption">Hidden</Typography>
              {hiddenOrder.map((id) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <button type="button" onClick={() => show(id)} aria-label={`Show ${widgetRegistry[id].title}`}>
                      {/* UI-UPGRADE.3 — was `bg-white/[var(--opacity-hover)]`; see `sensor-table.tsx`'s identical fix. */}
                      <Badge intent="outline" className="cursor-pointer gap-1 hover:bg-foreground/[var(--opacity-hover)]">
                        <Eye className="size-3" aria-hidden />
                        {widgetRegistry[id].title}
                      </Badge>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Show {widgetRegistry[id].title}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}

          <Divider orientation="vertical" className="h-5" />

          <Button intent="ghost" size="sm" leadingIcon={<RotateCcw className="size-3.5" />} onClick={resetLayout}>
            Reset Layout
          </Button>
        </div>
      )}
    </div>
  );
}
