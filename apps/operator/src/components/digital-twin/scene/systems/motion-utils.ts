/**
 * Small, shared motion helpers for anything that patrols a `Route` (Drone
 * Alpha, Robot Bravo, and future units). Kept framework-agnostic — no R3F
 * imports — so it's plain, cheap math callable from a `useFrame` loop.
 */

/** Shortest-path angle interpolation (handles the -π/π wrap correctly). */
export function lerpAngle(current: number, target: number, factor: number): number {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * factor;
}

/** Normalizes a per-frame lerp factor against a 60fps baseline so turning feels consistent across frame rates. */
export function frameLerpFactor(base: number, delta: number): number {
  return Math.min(1, base * delta * 60);
}

export interface RouteCursor {
  index: number;
  direction: 1 | -1;
}

/**
 * Advances a route cursor by one waypoint on arrival. Closed loops (`loop:
 * true`) wrap to the first waypoint; open routes (`loop: false`) reverse
 * direction at each end (ping-pong) instead of wrapping.
 */
export function advanceRouteCursor(cursor: RouteCursor, length: number, loop: boolean): RouteCursor {
  if (loop) {
    return { index: (cursor.index + 1) % length, direction: 1 };
  }

  const next = cursor.index + cursor.direction;
  if (next < 0 || next >= length) {
    const reversed: 1 | -1 = cursor.direction === 1 ? -1 : 1;
    return { index: cursor.index + reversed, direction: reversed };
  }
  return { index: next, direction: cursor.direction };
}
