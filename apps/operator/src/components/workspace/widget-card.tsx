"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, cn, tokens } from "@agrinexus/ui";

import { PRESET_COLUMN_CLASSES, SIZE_PRESET_SPANS } from "@/lib/workspace/layout";
import { widgetRegistry } from "@/lib/workspace/registry";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import type { WidgetId } from "@/lib/workspace/types";

import { PlaceholderWidgetBody } from "./placeholder-widget";
import { ResizeHandle } from "./resize-handle";
import { WidgetToolbar } from "./widget-toolbar";

const collapseTransition = {
  duration: tokens.motionDuration.base / 1000,
  ease: tokens.motionEasing.standard,
};

export interface WidgetCardProps {
  id: WidgetId;
  title: string;
  icon: LucideIcon;
  columnUnitPx: number;
}

export function WidgetCard({ id, title, icon: Icon, columnUnitPx }: WidgetCardProps) {
  const { widgets, presentationMode, fullscreenId, setPresetSize, setCustomSpan, toggleCollapse, enterFullscreen, exitFullscreen, hide } =
    useWorkspace();
  const widget = widgets[id];
  const isFullscreen = fullscreenId === id;
  const WidgetBody = widgetRegistry[id].component;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: presentationMode,
  });

  // Row span is always a computed number applied via inline style, for both
  // preset and custom sizes — see the note on `PRESET_COLUMN_CLASSES` for
  // why this can't be left to competing Tailwind row-span-* classes.
  const effectiveRowSpan = widget.collapsed
    ? 1
    : widget.size === "custom"
      ? widget.span.rowSpan
      : SIZE_PRESET_SPANS[widget.size].rowSpan;

  // This inline style is applied to THIS element (the actual CSS grid item —
  // the sortable's own node) rather than to the `Card` nested inside it.
  // `grid-column`/`grid-row` only have an effect on a direct child of the
  // `display: grid` container; applying them to a descendant further down
  // the tree (as this previously did) is a no-op, which is why custom
  // (pointer-resized) widgets used to fall back to the browser's implicit
  // 1x1 auto-placement and desync from what the resize handle showed.
  const gridItemStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridRow: `span ${effectiveRowSpan}`,
    ...(widget.size === "custom" ? { gridColumn: `span ${widget.span.columnSpan}` } : {}),
  };

  return (
    <motion.div
      ref={setNodeRef}
      layout={!isDragging}
      style={gridItemStyle}
      className={cn(
        "relative",
        widget.size === "custom" ? undefined : PRESET_COLUMN_CLASSES[widget.size],
        isDragging && "z-(--z-sticky) opacity-60",
        isFullscreen && "invisible",
      )}
    >
      <Card className="flex h-full min-h-32 flex-col overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-2 border-b border-border p-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="size-4 shrink-0 text-foreground-muted" aria-hidden />
            <CardTitle className="truncate text-sm">{title}</CardTitle>
          </div>
          {!presentationMode && (
            <WidgetToolbar
              title={title}
              size={widget.size}
              collapsed={widget.collapsed}
              fullscreen={isFullscreen}
              dragAttributes={attributes}
              dragListeners={listeners}
              onSetPreset={(preset) => setPresetSize(id, preset)}
              onToggleCollapse={() => toggleCollapse(id)}
              onToggleFullscreen={() => (isFullscreen ? exitFullscreen() : enterFullscreen(id))}
              onHide={() => hide(id)}
            />
          )}
        </CardHeader>

        <AnimatePresence initial={false}>
          {!widget.collapsed && (
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={collapseTransition}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 pt-0">
                {WidgetBody ? <WidgetBody /> : <PlaceholderWidgetBody icon={Icon} />}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>

        {!presentationMode && !widget.collapsed && (
          <ResizeHandle
            span={widget.span}
            columnUnitPx={columnUnitPx}
            onResize={(span) => setCustomSpan(id, span)}
            label={`Resize ${title}`}
          />
        )}
      </Card>
    </motion.div>
  );
}
