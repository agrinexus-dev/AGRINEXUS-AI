"use client";

import { useEffect, useState } from "react";

/**
 * Tracks `document.visibilityState` so `Scene` can stop
 * its R3F render loop entirely while the browser tab is backgrounded —
 * "ensure expensive rendering/animation work does not continue unnecessarily
 * when... the browser tab is backgrounded." Browsers already throttle
 * `requestAnimationFrame` heavily on a hidden tab as a built-in optimization,
 * but that throttling varies by browser/OS power settings and still leaves
 * an occasional frame ticking (and, on some platforms, WebGL contexts can be
 * more aggressively reclaimed under memory pressure while "still rendering"
 * than while fully paused) — an explicit `frameloop="never"` while hidden is
 * a stronger, more predictable guarantee, and costs nothing when the tab
 * genuinely IS visible (the common case). Doesn't touch route navigation or
 * any store/simulation timer — those keep running exactly as before; this
 * only pauses the WebGL draw loop itself.
 */
export function usePageVisibility(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    function handleChange() {
      setVisible(document.visibilityState === "visible");
    }
    handleChange();
    document.addEventListener("visibilitychange", handleChange);
    return () => document.removeEventListener("visibilitychange", handleChange);
  }, []);

  return visible;
}
