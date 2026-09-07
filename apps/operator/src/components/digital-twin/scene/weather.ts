import { calcPosFromAngles } from "@react-three/drei";
import * as THREE from "three";

/**
 * Visual-only weather presets (009C.6). No real weather API, no telemetry —
 * each preset is just a bundle of sky/light/fog/cloud numbers that the scene
 * reads to redraw itself. Nothing here touches farm/patrol/selection state.
 */
export type WeatherPreset = "sunny" | "partly-cloudy" | "cloudy" | "rainy";

export const WEATHER_PRESETS_ORDER: WeatherPreset[] = ["sunny", "partly-cloudy", "cloudy", "rainy"];

export const WEATHER_LABELS: Record<WeatherPreset, string> = {
  sunny: "Sunny",
  "partly-cloudy": "Partly Cloudy",
  cloudy: "Cloudy",
  rainy: "Rainy",
};

export interface WeatherConfig {
  /**
   * Sun elevation as drei's `calcPosFromAngles` actually interprets it:
   * `theta = π × (inclination − 0.5)`, so 0.5 = horizon, 1 = zenith, 0 =
   * straight down. Must stay above 0.5 for a daytime scene — anything below
   * puts the sun (and the directional light sharing its position, see
   * `Lighting`) below the horizon, which both looks wrong and produces a
   * degenerate shadow-camera projection.
   */
  sunInclination: number;
  sunAzimuth: number;
  skyTurbidity: number;
  skyRayleigh: number;
  skyMieCoefficient: number;
  skyMieDirectionalG: number;
  directionalIntensity: number;
  directionalColor: string;
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  hemisphereIntensity: number;
  ambientIntensity: number;
  ambientColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  /** Multiplies the base opacity of the drifting cloud puffs in `Environment`. */
  cloudOpacity: number;
  /** Multiplies each cloud's base scale — bigger, more overcast-looking puffs for overcast presets. */
  cloudScale: number;
  rain: boolean;
  /** Tints the ground/terrain slightly darker + desaturated for a "wet" look. */
  groundTint: string;
}

export const WEATHER_PRESETS: Record<WeatherPreset, WeatherConfig> = {
  sunny: {
    sunInclination: 0.68,
    sunAzimuth: 0.25,
    // Lower turbidity than before (was 3.2): in the Preetham model this
    // reads as a *clearer* atmosphere, which increases — not decreases —
    // the contrast between a deeper blue zenith and a brighter, hazier
    // horizon (longer light path through the atmosphere at the horizon
    // scatters more). Paired with a bit more rayleigh for richer blue.
    skyTurbidity: 2.6,
    skyRayleigh: 2.0,
    skyMieCoefficient: 0.003,
    skyMieDirectionalG: 0.82,
    directionalIntensity: 2.6,
    directionalColor: "#fff0c8",
    hemisphereSkyColor: "#bfe0ff",
    hemisphereGroundColor: "#4a6a3a",
    // More hemisphere / less flat ambient: hemisphere fill still varies
    // with surface orientation (sky-lit tops vs ground-bounce undersides),
    // where flat ambient lights every face equally and is the main
    // contributor to a "flat" look when it's too strong relative to the key
    // light.
    hemisphereIntensity: 0.85,
    ambientIntensity: 0.22,
    ambientColor: "#eaf3ff",
    fogColor: "#bcd9ee",
    fogNear: 70,
    fogFar: 180,
    cloudOpacity: 0.75,
    cloudScale: 1,
    rain: false,
    groundTint: "#ffffff",
  },
  "partly-cloudy": {
    sunInclination: 0.62,
    sunAzimuth: 0.22,
    skyTurbidity: 4.2,
    skyRayleigh: 1.9,
    skyMieCoefficient: 0.005,
    skyMieDirectionalG: 0.8,
    directionalIntensity: 2.0,
    directionalColor: "#fbe9c0",
    hemisphereSkyColor: "#aecbe0",
    hemisphereGroundColor: "#48653a",
    hemisphereIntensity: 0.8,
    ambientIntensity: 0.26,
    ambientColor: "#e4edf5",
    fogColor: "#aec3d2",
    fogNear: 60,
    fogFar: 160,
    cloudOpacity: 0.85,
    cloudScale: 1.25,
    rain: false,
    groundTint: "#f4f4f2",
  },
  cloudy: {
    sunInclination: 0.56,
    sunAzimuth: 0.2,
    skyTurbidity: 7.5,
    skyRayleigh: 1.0,
    skyMieCoefficient: 0.012,
    skyMieDirectionalG: 0.75,
    directionalIntensity: 1.05,
    directionalColor: "#dfe6ec",
    hemisphereSkyColor: "#8fa0ac",
    hemisphereGroundColor: "#3d4f38",
    hemisphereIntensity: 0.78,
    ambientIntensity: 0.36,
    ambientColor: "#c9d3da",
    fogColor: "#8d99a2",
    fogNear: 40,
    fogFar: 135,
    cloudOpacity: 0.95,
    cloudScale: 1.55,
    rain: false,
    groundTint: "#dfe1de",
  },
  rainy: {
    sunInclination: 0.52,
    sunAzimuth: 0.18,
    skyTurbidity: 10,
    skyRayleigh: 0.55,
    skyMieCoefficient: 0.018,
    skyMieDirectionalG: 0.7,
    directionalIntensity: 0.6,
    directionalColor: "#c3ccd4",
    hemisphereSkyColor: "#6c7982",
    hemisphereGroundColor: "#2c3a2a",
    hemisphereIntensity: 0.68,
    ambientIntensity: 0.4,
    ambientColor: "#aeb8bd",
    fogColor: "#707c82",
    fogNear: 26,
    fogFar: 100,
    cloudOpacity: 1,
    cloudScale: 1.7,
    rain: true,
    groundTint: "#c7cac5",
  },
};

const SUN_DISTANCE = 60;

/** World-space sun direction for a preset — shared by `SceneSky` (visual disc) and `Lighting` (key light position) so shadows line up with the sky. */
export function sunPositionFor(config: WeatherConfig): THREE.Vector3 {
  return calcPosFromAngles(config.sunInclination, config.sunAzimuth).multiplyScalar(SUN_DISTANCE);
}
