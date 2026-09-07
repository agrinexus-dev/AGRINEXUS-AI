"use client";

import { useMemo } from "react";
import { Sky } from "@react-three/drei";
import * as THREE from "three";

import { WEATHER_PRESETS, sunPositionFor, type WeatherPreset } from "./weather";

export interface SceneSkyProps {
  weather: WeatherPreset;
}

/**
 * Realistic daytime sky (009C.6) — drei's physically-based `Sky` (Preetham
 * model) instead of the old flat dark-gradient dome, so a real sun disc,
 * horizon haze and atmospheric scattering come for free and just respond to
 * `turbidity`/`rayleigh`/`mie*` per weather preset. Replaces the previous
 * shader-dome implementation entirely.
 */
export function SceneSky({ weather }: SceneSkyProps) {
  const config = WEATHER_PRESETS[weather];
  const sunPosition = useMemo(() => sunPositionFor(config), [config]);

  return (
    <Sky
      distance={400}
      sunPosition={sunPosition}
      turbidity={config.skyTurbidity}
      rayleigh={config.skyRayleigh}
      mieCoefficient={config.skyMieCoefficient}
      mieDirectionalG={config.skyMieDirectionalG}
    />
  );
}

/** Bright emissive disc + soft glow billboard at the sun's position — `Sky`'s own bright spot reads small at this scene's scale, this makes the sun clearly visible. */
export function SunDisc({ weather }: SceneSkyProps) {
  const config = WEATHER_PRESETS[weather];
  const sunPosition = useMemo(() => sunPositionFor(config), [config]);
  const visible = config.skyTurbidity < 10;

  const discGeometry = useMemo(() => new THREE.SphereGeometry(2.2, 16, 16), []);
  const glowGeometry = useMemo(() => new THREE.SphereGeometry(4, 16, 16), []);
  const discMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#fff6df", fog: false, toneMapped: false }),
    [],
  );
  const glowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffe9b0",
        transparent: true,
        opacity: 0.35,
        fog: false,
        toneMapped: false,
        depthWrite: false,
      }),
    [],
  );

  if (!visible) return null;

  return (
    <group position={sunPosition}>
      <mesh geometry={discGeometry} material={discMaterial} />
      <mesh geometry={glowGeometry} material={glowMaterial} />
    </group>
  );
}
