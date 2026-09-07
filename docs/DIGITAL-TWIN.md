# Digital Twin

The Digital Twin is a real‑time 3D scene of the farm and its operational state. It is the
spatial home of the product — the Operator has it as a full workspace and as a hero widget
on the Command Center; the Farmer has a dedicated Digital Twin page.

Source: `apps/operator/src/components/digital-twin/**`. Assets:
`apps/operator/public/models/*.glb` (15 GLB models).

## Technology

- **React Three Fiber 9** + **Drei 10** + **three.js 0.185**.
- The scene root (`scene/scene.tsx`) is wrapped in `memo` so the whole R3F subtree skips
  reconciliation when the page re‑renders for reasons the scene doesn't read.
- `<Scene>` is loaded through a plain runtime `import()` inside an effect (not a static
  top‑level import, and not `next/dynamic`) so the three.js bundle stays out of the
  Command Center's initial JavaScript payload and loads only when the Twin mounts.
- Adaptive device pixel ratio, a page‑visibility hook that pauses work when the tab is
  hidden, and a continuous render loop (`frameloop` left at R3F's default) because the
  units genuinely move.

## What the scene contains

```
scene/
  terrain.tsx           the ground surface
  farm-plots.tsx        plot geometry, selectable, drawn from farm data
  roads.tsx             the road network
  trees.tsx             instanced vegetation
  sky.tsx · lighting.tsx · camera-rig.tsx (OrbitControls)
  world/
    buildings.tsx       barn, warehouse, small building
    infrastructure.tsx  water tower, solar array, charging stations
    decorations.tsx     parked tractor and props
    environment.tsx · horizon.tsx · water.tsx · rain.tsx
  systems/
    drone.tsx           per-drone model + continuous patrol / mission motion
    robot.tsx           per-robot model + ground motion
    mission-markers.tsx · motion-utils.ts
  findings/             crop-finding markers (one canonical position per finding)
  missions/ · robot-missions/   mission path overlays
  sensors/              sensor markers
  sensor-analytics/     analytics heatmap overlays
```

## Intelligence overlays

Toggleable analytical layers rendered over the scene (`scene/intelligence/`):

| Overlay | Shows |
|---|---|
| Crop health | per‑plot crop condition |
| Disease risk | modeled disease‑risk zones |
| Drone coverage | where drones have surveyed |
| Irrigation | irrigation state / need |
| Energy | energy generation / consumption context |
| Sensor network | sensor placement and coverage |
| Heatmap | value heatmaps over the terrain |

Overlays fade smoothly on and off (`use-fade-opacity.ts`) rather than switching abruptly;
materials and geometries are built once and reused.

## On‑canvas UI

`digital-twin/ui/`:

- **Toolbar** — camera / follow‑drone / follow‑robot controls.
- **Layer Panel** — world‑layer visibility + the intelligence overlays.
- **Details Panel** — inspect a selected plot, drone, robot, sensor, mission, or finding;
  includes an "Ask AURA about this" action.
- **Mini‑map** — a top‑down SVG map with unit and finding positions.
- **Status Bar** — fleet / mission status at a glance.
- **Weather Control** — a **visual‑only** scene weather preset (Sunny / Partly Cloudy /
  Cloudy / Rainy). This changes the look of the scene only; it is **not** connected to the
  real Weather workspace or any weather API.
- **Intelligence Legend** — a key for whichever overlays are active.

Transient panels (Layer, Details) are given intentional z‑priority over ambient chrome
(Mini‑map, Weather, Legend, Status Bar).

## Where the data comes from

The scene subscribes to the same Zustand stores as the rest of the app. Fleet, robot,
sensor, plot, finding, mission, and recurring‑mission stores hydrate from the API on
mount, then **client‑side simulation hooks** advance the live values
(`use-mission-simulation.ts`, `use-robot-mission-simulation.ts`,
`use-sensor-simulation.ts`, and similar). Mission path lengths in the simulation are
computed from the real generated waypoints (segment‑aware), not an assumed equal split.

## Operator vs. Farmer

- **Operator** — the Digital Twin is a full workspace (`/digital-twin`) and a "large"
  widget in the Command Center's adaptive, resizable widget grid.
- **Farmer** — a dedicated page (`/farmer/digital-twin`) inside the Farmer shell, using
  the Farmer theme and localization.

## Current scope vs. future

**Current:** a fully interactive visualization driven by client‑side simulation. Selecting
an object opens its real record; the intelligence overlays are computed from real store
data where that data exists (findings, sensors, missions) and from a static
`intelligence-data.ts` array elsewhere.

**Future / not implemented:** synchronization to real‑world hardware — real drone/robot
GPS, real sensor readings, and real mission telemetry driving the scene and overlays in
real time. The scene is structured so that swapping the simulation hooks for a live
telemetry source would not require changing the scene components.
