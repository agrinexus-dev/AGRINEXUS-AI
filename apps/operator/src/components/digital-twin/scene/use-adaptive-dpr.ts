"use client";

import { useEffect, useState } from "react";

/**
 * GPU-tier-aware device pixel ratio cap. Fragment/
 * shadow-pass cost scales with pixel count — DPR², not DPR — so rendering at
 * a HiDPI display's full 2x-3x pixel density on an integrated GPU is a large,
 * avoidable chunk of every frame's cost for a scene this complex (~15 GLB
 * models, one soft-shadow-casting light, several transparent overlays).
 *
 * Rather than one hardcoded low ceiling for everyone (which would needlessly
 * blur the picture on a real discrete GPU), this reads `WEBGL_debug_renderer_info`
 * once on mount and classifies the renderer string: integrated/mobile/software
 * renderers (the ones this prompt is specifically about — "the user's laptop,
 * which uses integrated graphics") get capped at 1x; anything else (a
 * dedicated NVIDIA/AMD GPU, Apple Silicon) keeps the fuller [1, 2] range
 * `scene.tsx` already used. Falls back to the conservative capped tier if the
 * renderer string can't be read at all (some browsers block it under strict
 * privacy settings) — better to under-render than to assume capable hardware.
 *
 * A plain synchronous check, not a persisted setting — cheap enough (one
 * throwaway canvas, immediately discarded) to just redo per Digital Twin
 * mount rather than caching across sessions, and it naturally reflects
 * whatever GPU the CURRENT device actually has.
 */
const INTEGRATED_OR_SOFTWARE_RENDERER_PATTERN =
  /Intel|UHD|Iris(?!\s*Pro)|HD Graphics|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Mesa|Software|Microsoft Basic Render/i;

export type DprRange = [number, number];

const CAPPED_RANGE: DprRange = [1, 1];
const FULL_RANGE: DprRange = [1, 2];

function detectDprRange(): DprRange {
  if (typeof document === "undefined") return CAPPED_RANGE;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") || canvas.getContext("webgl")) as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) return CAPPED_RANGE;
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debugInfo ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string) : (gl.getParameter(gl.RENDERER) as string);
    if (typeof renderer === "string" && INTEGRATED_OR_SOFTWARE_RENDERER_PATTERN.test(renderer)) {
      return CAPPED_RANGE;
    }
    return FULL_RANGE;
  } catch {
    return CAPPED_RANGE;
  }
}

/** Starts at the conservative range for the very first frame (so there's never a flash of over-rendering before detection completes) and upgrades to the full range on the next tick if the GPU turns out to be capable. */
export function useAdaptiveDpr(): DprRange {
  const [range, setRange] = useState<DprRange>(CAPPED_RANGE);

  useEffect(() => {
    setRange(detectDprRange());
  }, []);

  return range;
}
