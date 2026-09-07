import type { WidgetLayoutState, WidgetSizePreset, WidgetSpan } from "./types";

/** 12-column grid; row unit is a fixed pixel height set on the grid container (see `WorkspaceGrid`). */
export const GRID_COLUMNS = 12;
export const GRID_ROW_UNIT_PX = 88;

/**
 * Row spans are sized to comfortably fit each preset's typical widget
 * content (header + a few lines/rows of body) without relying on scrolling
 * as the default experience — scrolling is the fallback for outliers, not
 * the norm. See `widget-card.tsx` for how these are actually applied.
 */
export const SIZE_PRESET_SPANS: Record<Exclude<WidgetSizePreset, "custom">, WidgetSpan> = {
  small: { columnSpan: 3, rowSpan: 2 },
  medium: { columnSpan: 4, rowSpan: 4 },
  large: { columnSpan: 6, rowSpan: 5 },
};

export const MIN_SPAN: WidgetSpan = { columnSpan: 3, rowSpan: 2 };
export const MAX_SPAN: WidgetSpan = { columnSpan: GRID_COLUMNS, rowSpan: 8 };

export function clampSpan(span: WidgetSpan): WidgetSpan {
  return {
    columnSpan: Math.min(MAX_SPAN.columnSpan, Math.max(MIN_SPAN.columnSpan, Math.round(span.columnSpan))),
    rowSpan: Math.min(MAX_SPAN.rowSpan, Math.max(MIN_SPAN.rowSpan, Math.round(span.rowSpan))),
  };
}

export function defaultLayoutFor(size: Exclude<WidgetSizePreset, "custom">): WidgetLayoutState {
  return {
    size,
    span: SIZE_PRESET_SPANS[size],
    collapsed: false,
    hidden: false,
  };
}

/**
 * Column span only — Tailwind's JIT can only pick up class names it can see
 * as literal strings, hence the fixed lookup table. `col-span-1` at the base
 * breakpoint matches the grid's `grid-cols-1` on narrow viewports, so widgets
 * stack full-width there; the preset's real span only applies from
 * `sm:`/`lg:` up, matching the grid's own `sm:grid-cols-6 lg:grid-cols-12`.
 *
 * Row span is deliberately NOT baked in here: it's computed as a plain
 * number in `widget-card.tsx` and applied via inline `gridRow` style
 * instead, uniformly for preset and custom sizes alike. Two same-specificity
 * Tailwind utility classes (e.g. a preset's `row-span-4` and a collapsed
 * widget's `row-span-1`) don't reliably override each other based on class
 * *attribute* order — the winner depends on generated stylesheet order,
 * which isn't something this list controls. A single numeric source avoids
 * that entirely.
 */
export const PRESET_COLUMN_CLASSES: Record<Exclude<WidgetSizePreset, "custom">, string> = {
  small: "col-span-1 sm:col-span-3",
  medium: "col-span-1 sm:col-span-4",
  large: "col-span-1 sm:col-span-6",
};
