/**
 * Static, typed placeholder farm geometry. Shaped the way real field/asset
 * data will eventually arrive (ids, labels, ground-plane coordinates) so a
 * future data source can replace these arrays without touching the
 * components that consume them.
 */

export type CropGrowthStage = "seedling" | "growing" | "mature" | "fallow";

export interface FarmPlotDefinition {
  id: string;
  label: string;
  /** Ground-plane (x, z) center, in scene units. */
  center: [number, number];
  /** (width, depth) on the ground plane, in scene units. */
  size: [number, number];
  growthStage: CropGrowthStage;
}

export const farmPlots: FarmPlotDefinition[] = [
  { id: "plot-a", label: "Plot A", center: [-13, -13], size: [20, 20], growthStage: "mature" },
  { id: "plot-b", label: "Plot B", center: [13, -13], size: [20, 20], growthStage: "growing" },
  { id: "plot-c", label: "Plot C", center: [-13, 13], size: [20, 20], growthStage: "seedling" },
  { id: "plot-d", label: "Plot D", center: [13, 13], size: [20, 20], growthStage: "fallow" },
];

export interface TreePlacement {
  position: [number, number, number];
  scale: number;
}

const treeRing = (radius: number, count: number, yOffset: number, scaleBase: number): TreePlacement[] =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + yOffset;
    return {
      position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
      scale: scaleBase + ((index % 3) * 0.08 - 0.08),
    };
  });

export const treePlacements: TreePlacement[] = [...treeRing(27, 14, 0, 1), ...treeRing(24, 10, 0.4, 0.85)];

/** Deterministic pseudo-random generator (mulberry32) — stable across renders, no `Math.random()`. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Roads: the existing cross (see `roads.tsx`) plus short spurs reaching the
// yard/building cluster on the east side.
// ---------------------------------------------------------------------------

export interface RoadSpurDefinition {
  id: string;
  center: [number, number];
  /** (width, depth) footprint on the ground plane. */
  size: [number, number];
}

export const roadSpurs: RoadSpurDefinition[] = [
  { id: "spur-yard-north", center: [25, -4.5], size: [2.2, 7] },
  { id: "spur-yard-south", center: [25, 4.5], size: [2.2, 7] },
];

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

export interface BuildingDefinition {
  id: string;
  label: string;
  kind: "warehouse" | "storage-shed" | "equipment-area";
  center: [number, number];
  size: [number, number];
  height: number;
}

export const buildings: BuildingDefinition[] = [
  { id: "warehouse", label: "Warehouse", kind: "warehouse", center: [29, -8], size: [7, 5], height: 4.2 },
  { id: "storage-shed", label: "Storage Shed", kind: "storage-shed", center: [29, 8], size: [5, 4], height: 3 },
  { id: "equipment-area", label: "Equipment Area", kind: "equipment-area", center: [29, 0], size: [5, 4], height: 1.4 },
];

// ---------------------------------------------------------------------------
// Infrastructure: charging pads, weather station, solar array, fence + gate.
// ---------------------------------------------------------------------------

export interface InfrastructureItem {
  id: string;
  label: string;
  kind: "drone-pad" | "robot-station" | "weather-station" | "solar-array";
  center: [number, number];
}

export const infrastructureItems: InfrastructureItem[] = [
  { id: "drone-pad", label: "Drone Charging Pad", kind: "drone-pad", center: [24, -8] },
  { id: "robot-station", label: "Robot Charging Station", kind: "robot-station", center: [24, 8] },
  { id: "weather-station", label: "Weather Station", kind: "weather-station", center: [-27, -20] },
  { id: "solar-array", label: "Solar Array", kind: "solar-array", center: [27, -16] },
];

export interface FencePostPlacement {
  position: [number, number, number];
  /**
   * Y-axis rotation (radians) applied to this instance (the fence-alignment
   * fix). `fence.glb`'s single mesh is NOT a compact
   * post: its own bounding box is ~0.95m (X) x ~8.57m (Y) x ~19.7m (Z) — a
   * long picket-fence PANEL whose long axis is local Z, not a symmetric
   * point-like post. Every instance was previously placed with an identity
   * rotation, so that ~19.7m-long axis always pointed along world Z
   * regardless of which side of the fence it was on. On the west/east
   * columns (posts spaced along Z) that happened to align with the actual
   * fence-line direction; on the north/south rows (posts spaced along X) it
   * did not — each "post" pointed perpendicular to the fence line it was
   * supposed to be running along, which is what made those two sides look
   * structurally different from the other two. North/south posts rotate
   * 90° so the panel's long axis runs along X instead; west/east keep the
   * unrotated orientation, which was already correct for them.
   */
  rotationY: number;
}

export const farmGate = { center: [0, 30] as [number, number], width: 6 };
const FENCE_HALF_EXTENT = 30;
const FENCE_SPACING = 3;

function buildFencePosts(): FencePostPlacement[] {
  const posts: FencePostPlacement[] = [];
  const steps = Math.floor((FENCE_HALF_EXTENT * 2) / FENCE_SPACING);
  // fence.glb's long axis is local Z (see `FencePostPlacement.rotationY`'s
  // own doc comment) — rotating 90° swings that axis onto world X, which is
  // the direction the north/south rows actually run in.
  const ALONG_X = Math.PI / 2;
  const ALONG_Z = 0;

  for (let i = 0; i <= steps; i += 1) {
    const t = -FENCE_HALF_EXTENT + i * FENCE_SPACING;

    posts.push({ position: [t, 0, -FENCE_HALF_EXTENT], rotationY: ALONG_X });

    // `<=` (not `<`): a post placed exactly on the gate's edge (t ±
    // farmGate.width / 2) would sit at the SAME (x, z) as one of the
    // dedicated gate-post cylinders below, doubling up geometry right at
    // the gate — the edge posts belong to the gate pillars, not the regular
    // fence run.
    const withinGate = Math.abs(t - farmGate.center[0]) <= farmGate.width / 2;
    if (!withinGate) posts.push({ position: [t, 0, FENCE_HALF_EXTENT], rotationY: ALONG_X });

    if (t !== -FENCE_HALF_EXTENT && t !== FENCE_HALF_EXTENT) {
      posts.push({ position: [-FENCE_HALF_EXTENT, 0, t], rotationY: ALONG_Z });
      posts.push({ position: [FENCE_HALF_EXTENT, 0, t], rotationY: ALONG_Z });
    }
  }

  return posts;
}

export const fencePosts: FencePostPlacement[] = buildFencePosts();
export const fenceHalfExtent = FENCE_HALF_EXTENT;

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

export const pond = { center: [0, -26] as [number, number], radius: 4.5 };
export const canal = { z: 25, halfLength: 18, width: 2.2 };
export const canalBridge = { center: [0, 25] as [number, number], size: [4.2, 3.4] as [number, number] };

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

export interface DecorationPlacement {
  position: [number, number, number];
  scale: number;
}

function scatterNear(
  seed: number,
  count: number,
  points: [number, number][],
  spread: number,
): DecorationPlacement[] {
  const random = seededRandom(seed);
  const placements: DecorationPlacement[] = [];

  for (let i = 0; i < count; i += 1) {
    const anchor = points[i % points.length];
    if (!anchor) continue;
    const [cx, cz] = anchor;
    const x = cx + (random() - 0.5) * spread;
    const z = cz + (random() - 0.5) * spread;
    placements.push({ position: [x, 0, z], scale: 0.6 + random() * 0.5 });
  }

  return placements;
}

export const bushPlacements: DecorationPlacement[] = scatterNear(
  7,
  22,
  [
    [29, -8],
    [29, 8],
    [29, 0],
    [-27, -20],
    [0, -26],
    [0, 30],
  ],
  6,
);

export const windIndicatorPosition: [number, number] = [-27, -14];
export const farmSignPosition: [number, number] = [0, 27];

// ---------------------------------------------------------------------------
// Environment: broad, lightweight animated ground grass. Filtered so it
// doesn't scatter across roads, plots, or water — a subtle background layer,
// not a per-object placement list.
// ---------------------------------------------------------------------------

function isInsidePlot(x: number, z: number, margin = 1): boolean {
  return farmPlots.some(({ center: [cx, cz], size: [w, d] }) => {
    return Math.abs(x - cx) < w / 2 + margin && Math.abs(z - cz) < d / 2 + margin;
  });
}

function isOnRoad(x: number, z: number, margin = 1.5): boolean {
  const onHorizontal = Math.abs(z) < margin && Math.abs(x) < 30;
  const onVertical = Math.abs(x) < margin && Math.abs(z) < 30;
  return onHorizontal || onVertical;
}

function isNearWater(x: number, z: number, margin = 2): boolean {
  const nearPond = Math.hypot(x - pond.center[0], z - pond.center[1]) < pond.radius + margin;
  const nearCanal = Math.abs(z - canal.z) < canal.width / 2 + margin && Math.abs(x) < canal.halfLength + margin;
  return nearPond || nearCanal;
}

export interface GrassBladePlacement {
  position: [number, number, number];
  rotationY: number;
  phase: number;
}

function buildGrassField(seed: number, count: number, halfExtent: number): GrassBladePlacement[] {
  const random = seededRandom(seed);
  const blades: GrassBladePlacement[] = [];
  let attempts = 0;

  while (blades.length < count && attempts < count * 6) {
    attempts += 1;
    const x = (random() - 0.5) * halfExtent * 2;
    const z = (random() - 0.5) * halfExtent * 2;

    if (isInsidePlot(x, z) || isOnRoad(x, z) || isNearWater(x, z)) continue;

    blades.push({ position: [x, 0, z], rotationY: random() * Math.PI, phase: random() * Math.PI * 2 });
  }

  return blades;
}

export const grassBladePlacements: GrassBladePlacement[] = buildGrassField(13, 260, 29);

// ---------------------------------------------------------------------------
// Waypoints & routes — a generic, typed model shared by any patrolling unit
// (today: Drone Alpha and Robot Bravo). Positions are ground-plane (x, z);
// altitude is owned by whichever unit consumes the route, not the route
// itself, since a ground unit and an aerial unit interpret "position" at a
// different height. Shaped this way so a future real mission-planning source
// can replace these arrays without the consuming components changing.
// ---------------------------------------------------------------------------

export interface Waypoint {
  id: string;
  label: string;
  /** Ground-plane (x, z) in scene units. */
  position: [number, number];
}

export interface Route {
  id: string;
  label: string;
  waypoints: Waypoint[];
  /** true = wraps to the first waypoint after the last (closed patrol loop); false = reverses direction at each end (ping-pong). */
  loop: boolean;
}

export const droneAltitude = 9;

export const droneRoute: Route = {
  id: "drone-alpha-patrol",
  label: "Perimeter Patrol",
  loop: true,
  waypoints: [
    { id: "wp-drone-1", label: "SW Perimeter", position: [-20, -20] },
    { id: "wp-drone-2", label: "SE Perimeter", position: [20, -20] },
    { id: "wp-drone-3", label: "NE Perimeter", position: [20, 20] },
    { id: "wp-drone-4", label: "NW Perimeter", position: [-20, 20] },
  ],
};

export const robotRoute: Route = {
  id: "robot-bravo-patrol",
  label: "Yard & Field Loop",
  loop: false,
  waypoints: [
    { id: "wp-robot-1", label: "Charging Station", position: [24, 8] },
    { id: "wp-robot-2", label: "Yard Junction", position: [25, 1] },
    { id: "wp-robot-3", label: "Central Road", position: [8, 0] },
    { id: "wp-robot-4", label: "West Field Access", position: [-18, 0] },
  ],
};

// ---------------------------------------------------------------------------
// Mission markers — static placeholders only, positioned near the plot each
// narratively relates to. No logic, no live state.
// ---------------------------------------------------------------------------

export type MissionMarkerKind = "inspection" | "warning" | "completed";

export interface MissionMarkerDefinition {
  id: string;
  kind: MissionMarkerKind;
  label: string;
  position: [number, number];
}

export const missionMarkers: MissionMarkerDefinition[] = [
  { id: "marker-inspection-1", kind: "inspection", label: "Inspection Point", position: [-11, 15] },
  { id: "marker-warning-1", kind: "warning", label: "Warning", position: [15, -11] },
  { id: "marker-completed-1", kind: "completed", label: "Completed", position: [-11, -11] },
];

export interface CloudPlacement {
  id: string;
  startX: number;
  z: number;
  y: number;
  scale: number;
  speed: number;
}

export const cloudPlacements: CloudPlacement[] = [
  { id: "cloud-1", startX: -30, z: -12, y: 24, scale: 3.4, speed: 0.35 },
  { id: "cloud-2", startX: 10, z: 6, y: 27, scale: 4.2, speed: 0.22 },
  { id: "cloud-3", startX: -8, z: 22, y: 23, scale: 2.8, speed: 0.3 },
  { id: "cloud-4", startX: 24, z: -22, y: 26, scale: 3, speed: 0.26 },
  { id: "cloud-5", startX: -22, z: 14, y: 25, scale: 2.4, speed: 0.4 },
];
