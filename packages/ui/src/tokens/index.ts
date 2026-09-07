/**
 * Typed mirror of the non-visual-cascade design tokens defined in
 * `src/styles/globals.css`. Color, typography, spacing, radius, shadow and
 * opacity tokens live in CSS only and are consumed via Tailwind utilities —
 * they have no reason to exist as JS values. Motion duration/easing,
 * z-index, and breakpoints are mirrored here because JS-side consumers
 * (Framer Motion, React Three Fiber overlays, resize/media-query logic)
 * need raw values, not CSS custom properties.
 *
 * Keep names in sync with the `--duration-*` / `--ease-*-value` / `--z-*`
 * custom properties in globals.css.
 */

export const motionDuration = {
  fast: 120,
  base: 200,
  slow: 320,
  slower: 480,
} as const;

export type MotionDurationToken = keyof typeof motionDuration;

/** Cubic-bezier curves as [x1, y1, x2, y2], ready for Framer Motion's `ease`. */
export const motionEasing = {
  standard: [0.4, 0, 0.2, 1],
  enter: [0, 0, 0.2, 1],
  exit: [0.4, 0, 1, 1],
  emphasized: [0.2, 0, 0, 1],
} as const satisfies Record<string, [number, number, number, number]>;

export type MotionEasingToken = keyof typeof motionEasing;

export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  overlay: 300,
  modal: 400,
  popover: 500,
  tooltip: 600,
  toast: 700,
} as const;

export type ZIndexToken = keyof typeof zIndex;

/** Pixel breakpoints, matching the `--breakpoint-*` values in globals.css. */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type BreakpointToken = keyof typeof breakpoints;
