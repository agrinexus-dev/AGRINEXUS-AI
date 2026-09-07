"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";

import { Skeleton, Typography } from "@agrinexus/ui";

import type { CameraRigHandle } from "@/components/digital-twin/scene/camera-rig";
import type { SceneProps } from "@/components/digital-twin/scene/scene";
import { DEFAULT_LAYER_VISIBILITY } from "@/components/digital-twin/types";
import { useFleetDroneRenderConfigs } from "@/lib/fleet/fleet-store";
import { useRobotRenderConfigs } from "@/lib/robots/robot-store";

/**
 * A live mini viewport onto the SAME `Scene` the full `/digital-twin` page
 * renders — same world, same drones, same robots — not a second scene graph.
 * The camera is intentionally non-interactive here (`pointer-events-none` on
 * the canvas wrapper, not a change to `CameraRig` itself): this widget lives
 * inside a draggable/resizable Adaptive Workspace Engine grid card, and an
 * orbit-draggable canvas would fight the card's own drag handle. The whole
 * card is clickable and keyboard-activatable, reusing the same
 * `router.push("/digital-twin")` navigation already wired up.
 *
 * `Scene` itself is loaded via a plain runtime `import()` inside the effect
 * below, NOT a static top-level import and NOT `next/dynamic` (a
 * performance decision — see `lib/workspace/registry.ts`'s doc comment for why
 * `next/dynamic` didn't actually defer it: Next still eagerly preloads a
 * `next/dynamic({ssr:false})` chunk the moment it's part of a rendered
 * page tree, and this widget is in Mission Control's default visible grid).
 * A bare `import()` called from `useEffect` only runs after this widget has
 * mounted on the client, so React Three Fiber/three.js/every GLTF loader
 * this scene pulls in is fetched lazily, in the background, well after
 * Mission Control's own first paint — not bundled into `/`'s initial script
 * tags at all. Measured: `/` First Load JS dropped from 561 kB to ~194 kB
 * (a large First Load JS reduction).
 */
const NOOP_DRONE_REF = () => {};
const NOOP_ROBOT_REF = () => {};

export function DigitalTwinHeroWidget() {
  const router = useRouter();
  const cameraRigRef = useRef<CameraRigHandle>(null);
  const fleetDrones = useFleetDroneRenderConfigs();
  const fleetRobots = useRobotRenderConfigs();
  const [SceneComponent, setSceneComponent] = useState<ComponentType<SceneProps & { ref?: typeof cameraRigRef }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/components/digital-twin/scene/scene").then((mod) => {
      if (!cancelled) setSceneComponent(() => mod.Scene);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function openDigitalTwin() {
    router.push("/digital-twin");
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openDigitalTwin}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDigitalTwin();
        }
      }}
      className="group flex h-full cursor-pointer flex-col gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-label="Open Digital Twin"
    >
      <div className="pointer-events-none relative min-h-32 flex-1 overflow-hidden rounded-lg border border-border-subtle bg-surface">
        {SceneComponent ? (
          <SceneComponent
            ref={cameraRigRef}
            layers={DEFAULT_LAYER_VISIBILITY}
            selectedId={null}
            onSelect={() => {}}
            onDeselect={() => {}}
            drones={fleetDrones}
            onDroneRef={NOOP_DRONE_REF}
            robots={fleetRobots}
            onRobotRef={NOOP_ROBOT_REF}
          />
        ) : (
          <Skeleton className="absolute inset-0 rounded-lg" />
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Typography variant="small">Live field overview · 3 active zones</Typography>
        <Typography variant="small" className="text-accent transition-transform group-hover:translate-x-0.5">
          Open Digital Twin →
        </Typography>
      </div>
    </div>
  );
}
