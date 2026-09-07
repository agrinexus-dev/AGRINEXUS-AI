"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react";
import { X } from "lucide-react";
import * as THREE from "three";

import { IconButton, Skeleton, Tooltip, TooltipContent, TooltipTrigger } from "@agrinexus/ui";

import { useActionBridgeStore } from "@/lib/aura/actions/action-bridge-store";
import { useLiveContextStore } from "@/lib/aura/context/live-context-store";
import { useAutonomousBehaviorScheduler } from "@/lib/autonomous/autonomous-behavior";
import { useFindingStore } from "@/lib/findings/finding-store";
import { useFleetDroneRenderConfigs, useFleetStore } from "@/lib/fleet/fleet-store";
import { useMissionStore } from "@/lib/missions/mission-store";
import { useRecurringMissionScheduler, useRecurringMissionStore } from "@/lib/recurring-missions/recurring-mission-store";
import { useRobotMissionStore } from "@/lib/robot-missions/robot-mission-store";
import { useRobotRenderConfigs, useRobotStore } from "@/lib/robots/robot-store";
import { useRobotSimulation } from "@/lib/robots/use-robot-simulation";
import { getPlotById, usePlotStore } from "@/lib/plots/plot-store";
import { useHistoricalSensorSimulation } from "@/lib/sensor-analytics/use-historical-sensor-simulation";
import { useSensorStore } from "@/lib/sensors/sensor-store";
import { useSensorSimulation } from "@/lib/sensors/use-sensor-simulation";

import type { CameraRigHandle } from "./scene/camera-rig";
import type { FarmPlotDefinition } from "./scene/farm-data";
import type { SceneProps } from "./scene/scene";
import type { AutonomousUnitHandle } from "./scene/systems/types";
import type { WeatherPreset } from "./scene/weather";
import { DetailsPanel } from "./ui/details-panel";
import { IntelligenceLegend } from "./ui/intelligence-legend";
import { LayerPanel } from "./ui/layer-panel";
import { MiniMap } from "./ui/mini-map";
import { StatusBar } from "./ui/status-bar";
import { Toolbar, type FollowTarget } from "./ui/toolbar";
import { WeatherControl } from "./ui/weather-control";
import { DEFAULT_LAYER_VISIBILITY, type LayerVisibility, type SelectableEntity } from "./types";

// The shell's ContentArea centers pages in a `max-w-6xl` column, which left
// large empty margins on wide screens (009D.7). The column's actual
// available width isn't a fixed number — it depends on the (collapsible)
// sidebar and the viewport — so instead of guessing at breakout CSS, this
// measures the real `<main>` element at runtime and bleeds this page's
// viewport out to it, leaving a fixed on-screen margin. Bounded by measured
// geometry, so it can never overflow past `main` or reach under the sidebar.
const BLEED_MARGIN_PX = 28;

// Deliberately slower than the Details Panel's own 300ms poll (see
// ui/details-panel.tsx) — neither the Fleet Store nor AURA's context need
// that precision. Runs whenever Digital Twin is mounted: the
// Fleet Store is now a real, always-relevant consumer (the Drone Fleet page,
// AURA), not just an AURA-only nicety like it was in 013B/013C.
const TELEMETRY_POLL_MS = 1000;

// Lightweight state preservation — "if possible, use
// lightweight state persistence rather than keeping the entire WebGL scene
// alive" was the deliberate choice, and profiling found the actual
// navigation-away cost is dominated by render-loop
// main-thread contention, not lost UI state — so this deliberately stays
// small: just the visible-layers configuration, read once via a lazy
// `useState` initializer and written back on change, entirely local to this
// component (no new store, no keep-alive/portal architecture). Camera
// position and the current selection are intentionally NOT restored here —
// doing so would mean extending `CameraRigHandle`'s imperative API and
// re-resolving a possibly-stale selected entity, which reaches past what
// this performance-focused prompt asks for without profiling evidence it's
// needed. `sessionStorage` (not `localStorage`) — this is "resume where I
// left off within this visit," not a permanent preference.
const LAYER_STATE_STORAGE_KEY = "agrinexus-digital-twin-layers";

function loadPersistedLayers(): LayerVisibility {
  if (typeof window === "undefined") return DEFAULT_LAYER_VISIBILITY;
  try {
    const raw = window.sessionStorage.getItem(LAYER_STATE_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYER_VISIBILITY;
    const parsed = JSON.parse(raw) as Partial<LayerVisibility>;
    // Merged over the defaults (not used as-is) so a layer key added in a
    // later prompt, absent from an older stored snapshot, still gets its
    // proper default rather than becoming `undefined`.
    return { ...DEFAULT_LAYER_VISIBILITY, ...parsed };
  } catch {
    return DEFAULT_LAYER_VISIBILITY;
  }
}

// Mirrors the two groups `LayerVisibility` already documents (world layers
// vs. the intelligence overlays) — used only to shape what gets
// published to AURA's Context Engine, not to change how layers behave.
const WORLD_LAYER_KEYS: (keyof LayerVisibility)[] = [
  "terrain",
  "plots",
  "roads",
  "trees",
  "crops",
  "buildings",
  "water",
  "infrastructure",
  "decorations",
  "drones",
  "robots",
];
const INTELLIGENCE_LAYER_KEYS: (keyof LayerVisibility)[] = [
  "cropHealth",
  "soilMoisture",
  "temperature",
  "humidity",
  "diseaseRisk",
  "irrigation",
  "sensorNetwork",
  "energy",
  "droneCoverage",
];

export interface DigitalTwinPageProps {
  /**
   * Server-fetched plot rows ("prefer server-loaded...
   * over unnecessary client-side fetching") — `app/(shell)/digital-twin/
   * page.tsx` is a Server Component that fetches these directly via
   * `listPlots()` (no HTTP round-trip needed, same process) and passes them
   * down here, so the Plot Store hydrates with zero client-side fetch in
   * the common case. Optional — the store is already seeded with the same
   * 4 demo plots from `farmPlots` regardless, so this page still renders
   * correctly (falling back to a client `fetchPlots()`) if it's ever
   * omitted, e.g. from a test harness.
   */
  initialPlots?: FarmPlotDefinition[];
}

/**
 * Digital Twin viewport + surrounding chrome (toolbar, layer manager,
 * selection details, status bar, mini-map). This is the whole page's own
 * root — it composes `Scene` (the R3F tree) with ordinary DOM UI layered on
 * top via absolute positioning, not inside the Canvas.
 */
export function DigitalTwinPage({ initialPlots }: DigitalTwinPageProps) {
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYER_VISIBILITY);
  const [layerPanelOpen, setLayerPanelOpen] = useState(true);
  const [presentation, setPresentation] = useState(false);
  const [selected, setSelected] = useState<SelectableEntity | null>(null);
  const [followTarget, setFollowTarget] = useState<FollowTarget>(null);
  const [weather, setWeather] = useState<WeatherPreset>("sunny");
  const cameraRigRef = useRef<CameraRigHandle>(null);
  // Every fleet drone's live handle, keyed by id — replaces
  // the old single `droneRef`, since there can now be any number of drones.
  // Robot Bravo is untouched: still exactly one robot, still one ref.
  const droneRefsRef = useRef<Map<string, AutonomousUnitHandle>>(new Map());
  // Every fleet robot's live handle, keyed by id — replaces the
  // old single `robotRef`, mirroring `droneRefsRef` exactly.
  const robotRefsRef = useRef<Map<string, AutonomousUnitHandle>>(new Map());
  const anchorRef = useRef<HTMLDivElement>(null);
  const [bleedStyle, setBleedStyle] = useState<CSSProperties>({});
  // `Scene` is loaded via a plain runtime `import()` in the effect below —
  // NOT a static top-level import (a performance decision). Measured
  // root cause: this whole component (chrome + Scene) was previously one
  // JS module, so the browser had to finish downloading/parsing the ENTIRE
  // ~539 kB route bundle — react-three-fiber, drei, and three.js included —
  // before React could render even the Toolbar/LayerPanel/StatusBar. A
  // Playwright-driven Chromium session measured the Toolbar/DOM chrome as
  // fully paintable within ~200ms of the route responding, so there's no
  // reason it should wait on Scene's own (much larger) chunk. This mirrors
  // the exact technique already proven safe in `digital-twin-hero-widget.tsx`
  // `next/dynamic` was tried there first and rejected
  // because Next still eagerly preloads a `next/dynamic({ssr:false})` chunk
  // the instant it's part of a rendered tree; a bare `import()` inside
  // `useEffect` only runs after mount, so it isn't part of this route's
  // initial script tags at all. `Scene` itself is completely unmodified.
  const [SceneComponent, setSceneComponent] = useState<ComponentType<SceneProps & { ref?: typeof cameraRigRef }> | null>(null);
  const publishDigitalTwinContext = useLiveContextStore((state) => state.publishDigitalTwinContext);
  const fleetDrones = useFleetDroneRenderConfigs();
  const updateDroneTelemetry = useFleetStore((state) => state.updateDroneTelemetry);
  const fleetRobots = useRobotRenderConfigs();
  const updateRobotTelemetry = useRobotStore((state) => state.updateRobotTelemetry);
  // AURA Natural-Language-Actions phase, mission-reliability fix — drone/
  // robot MISSION progression (`useMissionSimulation`/
  // `useRobotMissionSimulation`) moved to the app shells (`AppShell`/
  // `FarmerShell`), mounted once per session regardless of which page is
  // active, so a mission created via AURA keeps running after the farmer
  // navigates away from Digital Twin — see those hooks' own doc comments.
  // Not called here anymore (would double-tick every mission if it were).
  useRobotSimulation();
  // Same mounted-page-scoped lifecycle; the Digital Twin
  // is the one place BOTH drone and robot recurring schedules can actually
  // progress at once (see the Mission Planner pages' own single-vehicle-
  // kind scope).
  useRecurringMissionScheduler();
  // Same mounted-page-scoped lifecycle; the Digital
  // Twin is also where both autonomous drone and robot behavior are
  // visibly reconciled at once.
  useAutonomousBehaviorScheduler();
  // Keeps every sensor's simulated reading/battery/signal drifting (Prompt
  // 016A) — same mounted-page-scoped lifecycle as the hooks above.
  useSensorSimulation();
  // Keeps sensor history recording so "Trend Visualization"
  // has real data even when only the Digital Twin (not the Analytics page)
  // is open.
  useHistoricalSensorSimulation();

  // Hydrates the Plot Store — from the server-fetched
  // `initialPlots` prop when present (no network round-trip), falling back
  // to a normal client fetch otherwise. One-time, not a polling loop — Plot
  // data has no simulation drift, unlike Sensor's telemetry sync.
  useEffect(() => {
    if (initialPlots && initialPlots.length > 0) {
      usePlotStore.getState().hydrateFromServer(initialPlots);
    } else {
      void usePlotStore.getState().fetchPlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrates any Drone/Robot beyond Drone Alpha/Robot Bravo's already-seeded
  // local records — same one-time, merge-by-id pattern as the
  // Plot hydration above, so a drone/robot added on the Drone Fleet/Ground
  // Robots page still renders here after a hard refresh landing directly on
  // this route (not just after an in-session client navigation, where the
  // shared Zustand store already carries the state over for free).
  useEffect(() => {
    void useFleetStore.getState().fetchDrones();
    void useRobotStore.getState().fetchRobots();
  }, []);

  // Same hydration for Missions/Robot Missions — so the
  // mission overlays below still show a mission created on the Mission
  // Planner page after a hard refresh landing directly on this route.
  useEffect(() => {
    void useMissionStore.getState().fetchMissions();
    void useRobotMissionStore.getState().fetchRobotMissions();
  }, []);

  // Same one-time hydration pattern, so a finding
  // detected in an earlier session (or on the Mission Planner page) still
  // renders as a marker here after a hard refresh landing directly on this
  // route.
  useEffect(() => {
    void useFindingStore.getState().fetchFindings();
  }, []);

  useEffect(() => {
    void useRecurringMissionStore.getState().fetchRecurringMissions();
  }, []);

  // "clicking a crop alert should identify the exact
  // finding" here. Reads `?focusFinding=<id>` off the URL directly (no
  // `next/navigation` `useSearchParams`, which would force a Suspense
  // boundary around this already-large client page for one small feature)
  // rather than inventing a new selection/routing mechanism: it just calls
  // the SAME `setSelected` the 3D marker's own click handler already uses,
  // so the Details Panel renders identically either way. Polls the Finding
  // Store briefly since findings may still be mid-`fetchFindings()` on a
  // hard refresh landing directly on this route with the query param set.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const focusId = params.get("focusFinding");
    if (!focusId) return;

    let cancelled = false;
    let attempts = 0;
    const tryFocus = () => {
      if (cancelled) return;
      const finding = useFindingStore.getState().findings[focusId];
      if (finding) {
        setSelected({ id: finding.id, type: "finding", label: finding.plotLabel, meta: finding.description });
        return;
      }
      attempts += 1;
      if (attempts < 20) setTimeout(tryFocus, 250); // up to ~5s for fetchFindings() to land
    };
    tryFocus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    import("./scene/scene").then((mod) => {
      if (!cancelled) setSceneComponent(() => mod.Scene);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Restores a previous visit's layer configuration, client-side only — run
  // from an effect (not a lazy `useState` initializer) specifically so the
  // very first client render still matches the server-rendered
  // `DEFAULT_LAYER_VISIBILITY` and never trips a hydration mismatch;
  // sessionStorage isn't readable during SSR anyway. No-ops (and skips the
  // `setLayers` call entirely) when nothing was previously stored or it
  // exactly matches the default already in state.
  useEffect(() => {
    const persisted = loadPersistedLayers();
    setLayers((current) => (JSON.stringify(persisted) === JSON.stringify(current) ? current : persisted));
  }, []);

  // Writes the layer configuration back on every change, so the NEXT visit
  // (this tab/session only) can restore it via the effect above.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(LAYER_STATE_STORAGE_KEY, JSON.stringify(layers));
    } catch {
      // Storage can legitimately be unavailable (private browsing, quota) —
      // restoring layer visibility is a nicety, never worth surfacing an
      // error for.
    }
  }, [layers]);

  const handleDroneRef = useCallback((id: string, handle: AutonomousUnitHandle | null) => {
    if (handle) droneRefsRef.current.set(id, handle);
    else droneRefsRef.current.delete(id);
  }, []);

  const handleRobotRef = useCallback((id: string, handle: AutonomousUnitHandle | null) => {
    if (handle) robotRefsRef.current.set(id, handle);
    else robotRefsRef.current.delete(id);
  }, []);

  // Mirrors this page's own selection/weather/layers/camera-follow state into
  // AURA's Context Engine — read-only reflection, no Digital Twin behavior
  // changes. Hover is published separately, per-entity (see e.g. scene/systems/drone.tsx).
  useEffect(() => {
    publishDigitalTwinContext({
      selectedEntity: selected,
      weatherPreset: weather,
      visibleLayers: WORLD_LAYER_KEYS.filter((key) => layers[key]),
      enabledIntelligenceLayers: INTELLIGENCE_LAYER_KEYS.filter((key) => layers[key]),
      cameraMode: followTarget === "drone" ? "follow-drone" : followTarget === "robot" ? "follow-robot" : "free",
    });
  }, [selected, weather, layers, followTarget, publishDigitalTwinContext]);

  // Syncs every fleet drone's live position/battery/status into the Fleet
  // Store — the Drone Fleet page, AURA, and anything else
  // reads from there, never from a second copy. Robot Bravo keeps its old,
  // AURA-only-gated path into `live-context-store` unchanged (013B/013C);
  // the drone side no longer publishes there at all — AURA's context now
  // reads drones straight from the Fleet Store (see
  // `lib/aura/context/collect-context.ts`).
  useEffect(() => {
    function poll() {
      for (const [id, handle] of droneRefsRef.current) {
        const status = handle.getStatus();
        const object = handle.getObject();
        // Built conditionally rather than `position: object ? [...] : undefined`
        // — spreading an explicit `undefined` value would overwrite the
        // drone's last-known position in the store instead of leaving it.
        updateDroneTelemetry(id, {
          batteryPercent: status.batteryPercent,
          status: "patrolling",
          currentWaypointLabel: status.currentLabel,
          ...(object ? { position: [object.position.x, object.position.z] as [number, number] } : {}),
        });
      }
    }

    poll();
    const interval = setInterval(poll, TELEMETRY_POLL_MS);
    return () => clearInterval(interval);
  }, [updateDroneTelemetry]);

  // Syncs every fleet robot's live position into the Robot Store (Prompt
  // 015A) — mirrors the drone poll above, with one deliberate difference:
  // this poll never writes `status`. The drone poll always overwrites
  // `status: "patrolling"` (a pre-existing quirk of that untouched effect —
  // see `ui/details-panel.tsx`'s own doc comment on why the Fleet Store's
  // status has to be read directly rather than trusted from `getStatus()`);
  // for robots, `status` is instead owned entirely by the Robot Store's own
  // actions (pauseRobot/resumeRobot/sendRobotHome/assignMission/maintenance
  // + the Robot Simulation ticker's return-home arrival), so this poll only
  // ever pushes position/battery/current-destination, never status.
  useEffect(() => {
    function poll() {
      for (const [id, handle] of robotRefsRef.current) {
        const status = handle.getStatus();
        const object = handle.getObject();
        updateRobotTelemetry(id, {
          batteryPercent: status.batteryPercent,
          currentDestinationLabel: status.currentLabel,
          ...(object ? { position: [object.position.x, object.position.z] as [number, number] } : {}),
        });
      }
    }

    poll();
    const interval = setInterval(poll, TELEMETRY_POLL_MS);
    return () => clearInterval(interval);
  }, [updateRobotTelemetry]);

  // Registers this page's real camera/layer capabilities into the Action
  // Layer's bridge so AURA can invoke them — every entry below
  // just calls the SAME `cameraRigRef`/`setLayers`/`setFollowTarget`/
  // `setSelected` this page already uses, none of it rewritten. State reads
  // use the functional updater form (not `layers`/`followTarget`/`selected`
  // read from the closure) specifically so this effect has a stable
  // dependency array and registers once on mount rather than on every
  // state change.
  useEffect(() => {
    const registerDigitalTwinBridge = useActionBridgeStore.getState().registerDigitalTwinBridge;
    const unregisterDigitalTwinBridge = useActionBridgeStore.getState().unregisterDigitalTwinBridge;

    registerDigitalTwinBridge({
      focusPlot: (plotId) => {
        // Backend-aware lookup — see `plot-store.ts`'s
        // own doc comment for why this is one of only two lookups switched
        // over (the scene's own rendering, `<FarmPlots>`/`crops.tsx`, still
        // reads `farmPlots` directly and is untouched).
        const plot = getPlotById(plotId);
        if (!plot) return false;
        const focusTarget = new THREE.Object3D();
        focusTarget.position.set(plot.center[0], 0, plot.center[1]);
        setFollowTarget(null);
        cameraRigRef.current?.follow(focusTarget);
        return true;
      },
      locateDrone: (id) => {
        const handle = droneRefsRef.current.get(id);
        if (!handle) return false;
        setFollowTarget("drone");
        cameraRigRef.current?.follow(handle.getObject() ?? null);
        return true;
      },
      locateRobot: (id) => {
        const handle = robotRefsRef.current.get(id);
        if (!handle) return false;
        setFollowTarget("robot");
        cameraRigRef.current?.follow(handle.getObject() ?? null);
        return true;
      },
      locateSensor: (id) => {
        const sensor = useSensorStore.getState().sensors[id];
        if (!sensor) return false;
        const focusTarget = new THREE.Object3D();
        focusTarget.position.set(sensor.position[0], 0, sensor.position[1]);
        setFollowTarget(null);
        cameraRigRef.current?.follow(focusTarget);
        return true;
      },
      resetCamera: () => {
        // Same 3 calls as `handleResetCamera` below, inlined so this
        // registration effect doesn't need that (render-recreated) function
        // identity in its dependency array.
        setFollowTarget(null);
        cameraRigRef.current?.follow(null);
        cameraRigRef.current?.reset();
        return true;
      },
      setLayer: (key, enabled) => {
        if (!(key in DEFAULT_LAYER_VISIBILITY)) return false;
        const layerKey = key as keyof LayerVisibility;
        setLayers((current) => ({ ...current, [layerKey]: enabled }));

        if (!enabled) {
          const unitType = layerKey === "drones" ? "drone" : layerKey === "robots" ? "robot" : null;
          if (unitType) {
            setFollowTarget((currentFollow) => {
              if (currentFollow !== unitType) return currentFollow;
              cameraRigRef.current?.follow(null);
              return null;
            });
            setSelected((currentSelected) => (currentSelected?.type === unitType ? null : currentSelected));
          }
        }
        return true;
      },
    });

    return () => unregisterDigitalTwinBridge();
  }, []);

  // Hydration/Locate handoff: consumes a pending Sensor Network
  // "Locate" request left by `locateSensorInDigitalTwin` when
  // it had to navigate here first. This USED to run inline at the end of the
  // bridge-registration effect above, immediately on mount — but `<Scene>`
  // (and the `<CameraRig>` inside it that `locateSensor` actually moves)
  // loads via the `next/dynamic` import below, which resolves asynchronously
  // — well after this page's synchronous mount-time effects already ran. So
  // `locateSensor(pendingSensorLocateId)` was firing while `cameraRigRef.
  // current` was still `null`; `cameraRigRef.current?.follow(...)`'s optional
  // chaining silently no-op'd, and `locateSensor` still returned `true`
  // regardless — nothing surfaced as a visible failure, but the camera never
  // actually moved. Confirmed via the Digital Twin's own mini-map camera
  // marker: after a fresh Locate-triggered navigation, it stayed at the
  // default framing instead of moving toward the sensor.
  //
  // The fix: retry on a short bounded interval until `cameraRigRef.current`
  // genuinely exists (i.e. `<CameraRig>` has actually mounted), rather than
  // guessing at one specific "should be ready by now" signal — `SceneComponent`
  // turning non-null only means the dynamic import resolved, not that R3F's
  // own (separately-scheduled) Canvas root has committed `<CameraRig>` yet.
  useEffect(() => {
    const { pendingSensorLocateId } = useActionBridgeStore.getState();
    if (!pendingSensorLocateId) return;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 100; // ~5s at 50ms — generous for a dynamic import + Canvas mount, never blocks anything else

    function tryConsume() {
      if (cancelled) return;
      if (cameraRigRef.current) {
        const current = useActionBridgeStore.getState();
        if (current.pendingSensorLocateId) {
          current.digitalTwin?.locateSensor(current.pendingSensorLocateId);
          current.setPendingSensorLocateId(null);
        }
        return;
      }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) return; // gave up — sensor simply isn't locatable this load, no error to throw
      setTimeout(tryConsume, 50);
    }

    tryConsume();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const anchor = anchorRef.current;
    const main = anchor?.closest("main");
    if (!anchor || !main) return;

    function recalc() {
      if (!anchor || !main) return;
      const mainRect = main.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const width = mainRect.width - BLEED_MARGIN_PX * 2;
      if (width <= 0) return;
      setBleedStyle({
        marginLeft: mainRect.left + BLEED_MARGIN_PX - anchorRect.left,
        width,
        maxWidth: width,
      });
    }

    recalc();
    const observer = new ResizeObserver(recalc);
    observer.observe(main);
    return () => observer.disconnect();
  }, []);

  function toggleLayer(id: keyof LayerVisibility) {
    const turningOff = layers[id];
    setLayers((current) => ({ ...current, [id]: !current[id] }));
    if (!turningOff) return;

    // Hiding a unit's layer would otherwise leave the Details Panel/Camera
    // Follow pointing at a component that's about to unmount.
    const unitType = id === "drones" ? "drone" : id === "robots" ? "robot" : null;
    if (!unitType) return;
    if (followTarget === unitType) {
      setFollowTarget(null);
      cameraRigRef.current?.follow(null);
    }
    if (selected?.type === unitType) setSelected(null);
  }

  function handleResetCamera() {
    // Reset and Camera Follow shouldn't fight each other — clear follow first.
    setFollowTarget(null);
    cameraRigRef.current?.follow(null);
    cameraRigRef.current?.reset();
  }

  // The Toolbar's "Follow Drone"/"Follow Robot" buttons are single controls,
  // not per-unit — with a whole fleet now possible for both drones and
  // robots, each keeps following its fleet's first/primary
  // unit (Drone Alpha / Robot Bravo by default), same as the one unit each
  // button always followed before.
  function handleToggleFollow(target: "drone" | "robot") {
    setFollowTarget((current) => {
      const next = current === target ? null : target;
      const handle =
        next === "drone"
          ? droneRefsRef.current.get(fleetDrones[0]?.id ?? "")
          : next === "robot"
            ? robotRefsRef.current.get(fleetRobots[0]?.id ?? "")
            : null;
      cameraRigRef.current?.follow(handle?.getObject() ?? null);
      return next;
    });
  }

  // Memoized so this stays referentially stable across
  // renders — otherwise a fresh inline arrow function on every render would
  // defeat `Scene`'s new `memo` wrapper (see scene.tsx) for no reason, since
  // `setSelected` itself never changes.
  const handleDeselect = useCallback(() => setSelected(null), []);

  return (
    // `anchor` stays in normal flow (no size/position override) so it always
    // reports the shell's true `max-w-6xl`-constrained position — the stable
    // reference point `bleedStyle` measures against. The styled child then
    // bleeds out to `main`'s real edges minus BLEED_MARGIN_PX, computed in
    // the effect above.
    <div ref={anchorRef}>
      <div
        style={bleedStyle}
        // `78vh` → `82vh`: a small, safe viewport-sizing
        // increase (page-chrome CSS only — the 3D scene itself is
        // untouched) so the now-much-wider viewport (the width fix lives
        // entirely in `farmer-shell.tsx`, via this page's own pre-existing
        // `bleedStyle` measurement above) doesn't read as unusually
        // short/letterboxed at desktop resolutions (MVP-UI.1-A audit).
        className="relative h-[82vh] min-h-[600px] w-full overflow-hidden rounded-xl border border-border bg-surface"
      >
        {SceneComponent ? (
          <SceneComponent
            ref={cameraRigRef}
            layers={layers}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onDeselect={handleDeselect}
            drones={fleetDrones}
            onDroneRef={handleDroneRef}
            robots={fleetRobots}
            onRobotRef={handleRobotRef}
            weather={weather}
          />
        ) : (
          // In-page "Scene loading" state — shown only
          // for the brief window after the route-level `loading.tsx` has
          // already handed off to this real page (chrome is interactive) but
          // before `Scene`'s own chunk has finished loading. Same viewport
          // skeleton shape `loading.tsx` uses, so there's no visible jump
          // between the two.
          <Skeleton className="absolute inset-3 rounded-lg" />
        )}

        {presentation ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                aria-label="Exit presentation"
                icon={<X />}
                intent="ghost"
                size="sm"
                className="pointer-events-auto absolute top-3 right-3 z-(--z-sticky) bg-surface-elevated/80 backdrop-blur-md"
                onClick={() => setPresentation(false)}
              />
            </TooltipTrigger>
            <TooltipContent side="left">Exit presentation</TooltipContent>
          </Tooltip>
        ) : (
          <>
            <Toolbar
              layerPanelOpen={layerPanelOpen}
              onToggleLayerPanel={() => setLayerPanelOpen((value) => !value)}
              onResetCamera={handleResetCamera}
              presentation={presentation}
              onTogglePresentation={() => setPresentation(true)}
              followTarget={followTarget}
              onToggleFollow={handleToggleFollow}
              droneAvailable={layers.drones}
              robotAvailable={layers.robots}
            />

            {/*
              MVP-UI.1-B — every overlay below previously shared the exact
              same ad-hoc `z-10`, with no intentional stacking order between
              them (MVP-UI.1-A audit §8/§11 — a status-bar/tooltip collision
              was observed with a live screenshot's own popup). Now split
              into two intentional tiers using this project's EXISTING
              semantic z-index tokens (`packages/ui/src/tokens/index.ts` /
              `globals.css`, the same `--z-sticky` `farmer-shell.tsx`'s own
              header already uses): transient, selection-driven overlays
              (the Layer panel once opened, the Details panel once
              something is selected) sit at `--z-popover`, ABOVE the
              always-present ambient chrome (minimap/weather/legend/status
              bar) at `--z-sticky` — so an active selection's detail card
              can never be hidden behind the persistent status strip.
              NOTE (see this milestone's own report): the specific popup
              seen in the MVP-UI.1-A audit screenshot ("Online / Plot D
              Soil / pH 6.61") does not match this file's own panel
              positions and is very likely rendered INSIDE the protected 3D
              scene as a world-anchored overlay — this change fixes the
              stacking order among PAGE-CHROME elements themselves, but
              does not touch (and cannot fix, without crossing the
              Digital-Twin scene boundary) a scene-embedded overlay's own
              stacking.
            */}
            {layerPanelOpen ? (
              <div className="pointer-events-auto absolute top-16 left-3 z-(--z-popover)">
                <LayerPanel layers={layers} onToggle={toggleLayer} />
              </div>
            ) : null}

            {selected ? (
              <div className="pointer-events-auto absolute top-16 right-3 z-(--z-popover)">
                <DetailsPanel selected={selected} droneRefs={droneRefsRef} robotRefs={robotRefsRef} />
              </div>
            ) : null}

            <div className="pointer-events-auto absolute right-3 bottom-12 z-(--z-sticky)">
              <MiniMap cameraRigRef={cameraRigRef} droneRefs={droneRefsRef} robotRefs={robotRefsRef} />
            </div>

            <div className="pointer-events-auto absolute bottom-12 left-3 z-(--z-sticky)">
              <WeatherControl weather={weather} onChange={setWeather} />
            </div>

            <div className="pointer-events-auto absolute bottom-28 left-3 z-(--z-sticky)">
              <IntelligenceLegend layers={layers} />
            </div>

            <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-(--z-sticky)">
              <StatusBar />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
