"use client";

import { useRef } from "react";

import { cn } from "@agrinexus/ui";

import { GRID_ROW_UNIT_PX } from "@/lib/workspace/layout";
import type { WidgetSpan } from "@/lib/workspace/types";

export interface ResizeHandleProps {
  /** Current effective span, used as the drag's starting point. */
  span: WidgetSpan;
  /** Pixel width of a single grid column, measured by the parent grid. */
  columnUnitPx: number;
  onResize: (span: WidgetSpan) => void;
  label: string;
}

/**
 * Pointer-only free-form resize (mouse/touch). The keyboard-accessible path
 * to resizing is the S/M/L preset buttons in the widget toolbar, not this
 * handle — see the Widget Toolbar for that.
 */
export function ResizeHandle({ span, columnUnitPx, onResize, label }: ResizeHandleProps) {
  const dragState = useRef<{ startX: number; startY: number; startSpan: WidgetSpan } | null>(null);

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = { startX: event.clientX, startY: event.clientY, startSpan: span };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragState.current;
    if (!drag || columnUnitPx <= 0) return;

    const deltaCols = Math.round((event.clientX - drag.startX) / columnUnitPx);
    const deltaRows = Math.round((event.clientY - drag.startY) / GRID_ROW_UNIT_PX);

    onResize({
      columnSpan: drag.startSpan.columnSpan + deltaCols,
      rowSpan: drag.startSpan.rowSpan + deltaRows,
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragState.current = null;
  }

  return (
    <button
      type="button"
      aria-label={label}
      tabIndex={-1}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={cn(
        "absolute right-0 bottom-0 size-4 cursor-nwse-resize touch-none rounded-tl-sm",
        "border-t border-l border-border-subtle bg-transparent",
        "hover:border-accent/60 focus-visible:outline-none",
      )}
    />
  );
}
