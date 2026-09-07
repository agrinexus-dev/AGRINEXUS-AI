"use client";

import { forwardRef, memo, Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";

import type { DroneRenderConfig } from "@/lib/fleet/types";
import type { RobotRenderConfig } from "@/lib/robots/types";

import type { LayerVisibility, SelectableEntity } from "../types";
import { CameraRig, type CameraRigHandle, CAMERA_INITIAL_POSITION_ARRAY } from "./camera-rig";
import { Crops } from "./crops";
import { FarmPlots } from "./farm-plots";
import { IntelligenceLayers } from "./intelligence/intelligence-layers";
import { Lighting } from "./lighting";
import { Roads } from "./roads";
import { SceneSky, SunDisc } from "./sky";
import { FindingMarkers } from "./findings/finding-markers";
import { MissionOverlays } from "./missions/mission-overlays";
import { RobotMissionOverlays } from "./robot-missions/robot-mission-overlays";
import { AnalyticsHeatmapOverlays } from "./sensor-analytics/analytics-heatmap-overlays";
import { SensorMarkers } from "./sensors/sensor-markers";
import { Drone } from "./systems/drone";
import { MissionMarkers } from "./systems/mission-markers";
import { Robot } from "./systems/robot";
import type { AutonomousUnitHandle } from "./systems/types";
import { Terrain } from "./terrain";
import { Trees } from "./trees";
import { useAdaptiveDpr } from "./use-adaptive-dpr";
import { usePageVisibility } from "./use-page-visibility";
import { WEATHER_PRESETS, type WeatherPreset } from "./weather";
import { Buildings } from "./world/buildings";
import { Decorations } from "./world/decorations";
import { Environment } from "./world/environment";
import { Horizon } from "./world/horizon";
import { Infrastructure } from "./world/infrastructure";
import { Rain } from "./world/rain";
import { Water } from "./world/water";

export interface SceneProps {
  layers: LayerVisibility;
  selectedId: string | null;
  onSelect: (entity: SelectableEntity) => void;
  onDeselect: () => void;
  /**
   * Every drone the Fleet Store currently holds — Scene
   * renders one `<Drone>` per entry, so 1/5/20 drones in the store means
   * 1/5/20 rendered here, with no further changes needed on this end.
   * `onDroneRef` is a registry callback (id, handle) rather than a single
   * `RefObject` (the old shape, now Robot's alone) since callers need to
   * reach any one of N drones, not just one.
   */
  drones: DroneRenderConfig[];
  onDroneRef: (id: string, handle: AutonomousUnitHandle | null) => void;
  /**
   * Every robot the Robot Store currently holds — mirrors
   * `drones`/`onDroneRef` above exactly: Scene renders one `<Robot>` per
   * entry, so 1/5/20 robots means 1/5/20 rendered here. Replaces the old
   * single `robotRef` prop (Robot Bravo was the only unit that shape could
   * ever describe).
   */
  robots: RobotRenderConfig[];
  onRobotRef: (id: string, handle: AutonomousUnitHandle | null) => void;
  /** Visual-only atmosphere preset. Defaults to "sunny" so callers that don't pass it — e.g. the Command Center hero widget — automatically pick up the same improved daytime look. */
  weather?: WeatherPreset;
}

/**
 * Scene root — composes camera, lighting, sky, and the toggleable farm world
 * + autonomous-system layers. No business/telemetry logic lives here.
 *
 * Wrapped in `memo` so this whole R3F subtree skips
 * reconciliation when the parent `DigitalTwinPage` re-renders for reasons
 * that don't actually change anything Scene reads — e.g. toggling the AURA
 * panel, which that page also subscribes to. Purely a render-avoidance
 * wrapper; nothing about what Scene renders or how it behaves changes. Only
 * pays off because every prop below is already referentially stable
 * (state/refs, or `onDeselect`, memoized with `useCallback` where it's
 * created — see `digital-twin-page.tsx`).
 *
 * `frameloop` is deliberately left at R3F's default continuous mode, NOT
 * `"demand"` (investigated, not implemented). Every
 * object that actually needs a continuous loop is legitimate, ongoing
 * motion, not decoration: `drone.tsx`/`robot.tsx` patrol continuously
 * whenever a unit isn't idle, `CameraRig`'s orbit damping + follow-lerp
 * (`camera-rig.tsx`) need every frame while the user drags or a follow
 * target moves, and clouds/grass sway are ambient but always running (see
 * the grass throttle above instead — a real, contained fix for that one).
 * A correct `"demand"` conversion would mean threading an explicit
 * `invalidate()` call through all ~11 `useFrame` sites AND the 1-2s
 * `setInterval`-based mission/robot/sensor simulation tickers (which don't
 * call into R3F at all today, so "demand" mode would silently stop
 * rendering their effects until something else happened to also move the
 * mouse) — real, non-trivial architectural surface area, exactly what this
 * prompt says not to touch without proof it's safe. This app has no
 * hardware access to verify such a change wouldn't introduce stale-frame
 * bugs (a mission progressing with no visible update, a drone's position
 * silently lagging), so it's left at `"always"` and Part 9's tab-visibility
 * pause (`usePageVisibility`, below) is used instead — same "don't render
 * when nobody's watching" goal, none of the invalidation-plumbing risk.
 *
 * No LOD (distance-based level-of-detail) system either (also
 * investigated, not implemented). This scene's models are
 * already low-poly by construction (the heaviest, `crops.glb`, is ~73k
 * vertices across 6 primitives; most are in the hundreds-to-low-thousands —
 * ), and the actual measured weight
 * was texture fill-rate (now fixed — see the three re-encoded GLBs) and
 * shadow-pass fill-rate (now halved), not geometry complexity. A LOD system
 * would add real engineering surface (swap logic, popping artifacts,
 * per-object distance checks every frame) to solve a problem this scene
 * doesn't actually have — "do not introduce a complicated LOD framework
 * merely for theoretical optimization" is exactly this case.
 */
export const Scene = memo(
  forwardRef<CameraRigHandle, SceneProps>(function Scene(
    { layers, selectedId, onSelect, onDeselect, drones, onDroneRef, robots, onRobotRef, weather = "sunny" },
    ref,
  ) {
    const config = WEATHER_PRESETS[weather];

    // Progressive model loading — `crops`, `infrastructure`,
    // and `decorations` are the three heaviest GLB groups in this scene
    // (wheat-field.glb + crops.glb, fence.glb, tractor.glb — ~6.4 MB
    // combined), and none of them
    // is what a user orients against first. Deferring their mount by one
    // idle tick lets the browser's network stack prioritize the base
    // terrain/roads/plots/buildings/trees/drones/robots — the pieces the
    // Toolbar/DetailsPanel/MiniMap already assume exist — before starting
    // those three heavy fetches. Final visual state is unchanged (every
    // layer still appears exactly as before, still gated by the same
    // `layers.*` flags); only the MOUNT ORDER shifts by well under a
    // second. `requestIdleCallback` (with a bounded timeout + a plain
    // `setTimeout` fallback for browsers without it) rather than a fixed
    // delay, so a fast/idle browser doesn't wait longer than necessary.
    const [heavyLayersReady, setHeavyLayersReady] = useState(false);
    useEffect(() => {
      const win = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (handle: number) => void };
      if (typeof win.requestIdleCallback === "function") {
        const handle = win.requestIdleCallback(() => setHeavyLayersReady(true), { timeout: 800 });
        return () => win.cancelIdleCallback?.(handle);
      }
      const timer = setTimeout(() => setHeavyLayersReady(true), 400);
      return () => clearTimeout(timer);
    }, []);

    // Capability-aware DPR (superseding 017B's flat
    // [1, 1.5] cap) — `useAdaptiveDpr` reads the actual WebGL renderer
    // string once on mount and caps at 1x specifically for integrated/
    // mobile/software renderers (Intel UHD/Iris, Mali, Adreno, SwiftShader,
    // llvmpipe, …) while keeping the full [1, 2] range on a real discrete
    // GPU or Apple Silicon — "preserve higher quality on capable GPUs"
    // rather than one hardcoded low ceiling for everyone. See that hook's
    // own doc comment for the full reasoning and the exact pattern list.
    const dprRange = useAdaptiveDpr();
    // Pauses the render loop entirely while the browser tab is backgrounded
    // see `use-page-visibility.ts`'s own doc comment.
    // `"always"` is R3F's default continuous loop, unchanged for the normal
    // (visible) case; every drone/robot/camera/mission animation already
    // assumes it, so nothing else here changes.
    const pageVisible = usePageVisibility();

    return (
      <Canvas dpr={dprRange} shadows="soft" gl={{ antialias: true }} frameloop={pageVisible ? "always" : "never"} onPointerMissed={onDeselect}>
        <PerspectiveCamera makeDefault position={CAMERA_INITIAL_POSITION_ARRAY} fov={42} near={0.1} far={300} />
        <CameraRig ref={ref} />
        <Lighting weather={weather} />
        <SceneSky weather={weather} />
        <SunDisc weather={weather} />
        <fog attach="fog" args={[config.fogColor, config.fogNear, config.fogFar]} />
        <Horizon weather={weather} />
        {layers.terrain ? <Terrain weather={weather} /> : null}
        {layers.roads ? <Roads selectedId={selectedId} onSelect={onSelect} /> : null}
        {layers.plots ? <FarmPlots /> : null}
        {layers.crops && heavyLayersReady ? (
          <Suspense fallback={null}>
            <Crops selectedId={selectedId} onSelect={onSelect} />
          </Suspense>
        ) : null}
        {/* These layers load real GLB models (see `use-model-part.ts`) — each gets its own Suspense boundary so one still-loading asset doesn't blank layers that don't need one. */}
        {layers.trees ? (
          <Suspense fallback={null}>
            <Trees />
          </Suspense>
        ) : null}
        {layers.water ? <Water /> : null}
        {layers.buildings ? (
          <Suspense fallback={null}>
            <Buildings selectedId={selectedId} onSelect={onSelect} />
          </Suspense>
        ) : null}
        {layers.infrastructure && heavyLayersReady ? (
          <Suspense fallback={null}>
            <Infrastructure />
          </Suspense>
        ) : null}
        {layers.decorations && heavyLayersReady ? (
          <Suspense fallback={null}>
            <Decorations />
          </Suspense>
        ) : null}
        {layers.drones ? (
          <Suspense fallback={null}>
            {drones.map((drone) => (
              // Keyed on routeVersion, not just id: when the
              // Mission Simulation diverts/restores this drone's route, the
              // resulting remount gives `<Drone>` a fresh internal waypoint
              // cursor starting at index 0 on the new route — with zero
              // changes to drone.tsx itself. Ordinary telemetry ticks never
              // touch routeVersion, so this never remounts on a battery/
              // position update.
              <Drone
                key={`${drone.id}:${drone.routeVersion}`}
                ref={(handle) => onDroneRef(drone.id, handle)}
                config={drone}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
          </Suspense>
        ) : null}
        {layers.robots ? (
          <Suspense fallback={null}>
            {robots.map((robot) => (
              // Keyed on routeVersion, not just id — same
              // remount-on-route-change technique `drones` above already
              // uses, so a Send Home/Assign Mission/Resume route swap resets
              // this robot's internal waypoint cursor with zero changes to
              // robot.tsx's own movement code.
              <Robot
                key={`${robot.id}:${robot.routeVersion}`}
                ref={(handle) => onRobotRef(robot.id, handle)}
                config={robot}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
          </Suspense>
        ) : null}
        <MissionMarkers />
        <Environment weather={weather} />
        {config.rain ? <Rain /> : null}
        <IntelligenceLayers layers={layers} />
        <MissionOverlays layers={layers} />
        <RobotMissionOverlays layers={layers} />
        <SensorMarkers layers={layers} selectedId={selectedId} onSelect={onSelect} />
        <FindingMarkers layers={layers} selectedId={selectedId} onSelect={onSelect} />
        <AnalyticsHeatmapOverlays layers={layers} />
      </Canvas>
    );
  }),
);
