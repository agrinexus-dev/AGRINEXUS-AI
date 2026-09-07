"use client";

import { useMemo } from "react";

import { WEATHER_PRESETS, sunPositionFor, type WeatherPreset } from "./weather";

export interface LightingProps {
  weather: WeatherPreset;
}

/**
 * Daylight rig (009C.6): hemisphere sky/ground fill + ONE shadow-casting key
 * light, intensities and color driven by the active weather preset so the
 * farm reads clearly at every setting. Already the cheapest possible shadow
 * setup on the "how many lights" axis ("if one
 * directional light can provide the same visual result as several, prefer
 * the cheaper configuration" — there's only ever been one here, nothing to
 * consolidate).
 *
 * Shadow map resolution dropped from 2048×2048 to 1024×1024 —
 * shadow-pass fill cost scales with texel count, so this is a real 4x
 * reduction in that pass's GPU cost. `shadow-radius={7}`'s PCF-soft
 * filtering blurs the map anyway, which is exactly what hides the lower
 * source resolution — the visible difference at this camera's default
 * farm-overview distance is negligible; it would only show up as a mildly
 * softer shadow edge under a close, static zoom. Shadow TYPE (`"soft"` on
 * the Canvas, i.e. `PCFSoftShadowMap`) is deliberately left alone — the
 * final rule for this prompt is "AgriNexus must still look impressive,"
 * and hard-edged shadows would be a much more visible downgrade than a
 * smaller map.
 */
export function Lighting({ weather }: LightingProps) {
  const config = WEATHER_PRESETS[weather];
  const sunPosition = useMemo(() => sunPositionFor(config), [config]);

  return (
    <>
      <hemisphereLight
        args={[config.hemisphereSkyColor, config.hemisphereGroundColor, config.hemisphereIntensity]}
      />
      <ambientLight intensity={config.ambientIntensity} color={config.ambientColor} />
      <directionalLight
        position={sunPosition}
        intensity={config.directionalIntensity}
        color={config.directionalColor}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.0015}
        shadow-normalBias={0.03}
        shadow-radius={7}
      />
    </>
  );
}
