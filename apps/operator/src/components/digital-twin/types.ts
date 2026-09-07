export interface LayerVisibility {
  terrain: boolean;
  plots: boolean;
  roads: boolean;
  trees: boolean;
  crops: boolean;
  buildings: boolean;
  water: boolean;
  infrastructure: boolean;
  decorations: boolean;
  drones: boolean;
  robots: boolean;
  /** Visual intelligence overlays — simulated data only, independent of the base world layers above. */
  cropHealth: boolean;
  soilMoisture: boolean;
  temperature: boolean;
  humidity: boolean;
  diseaseRisk: boolean;
  irrigation: boolean;
  sensorNetwork: boolean;
  energy: boolean;
  droneCoverage: boolean;
  /** Mission Planning overlays — independent of the world/intelligence layers above, gated the same way. */
  missionPaths: boolean;
  missionBoundaries: boolean;
  missionWaypoints: boolean;
  missionWaypointNumbers: boolean;
  missionCoverage: boolean;
  missionLabels: boolean;
  missionCurrentTarget: boolean;
  /** Robot Mission Planning overlays — independent toggles from the drone Mission layers above, so both systems can be shown/hidden separately while coexisting in the same scene. */
  robotMissionRoutes: boolean;
  robotMissionBoundaries: boolean;
  robotMissionWaypoints: boolean;
  robotMissionLabels: boolean;
  robotMissionCoverage: boolean;
  robotMissionCurrentTarget: boolean;
  /**
   * Sensor Network entity overlays — a distinct, `sensor`-
   * prefixed key set from the pre-existing `sensorNetwork` key above (that
   * one gates the older static heatmap-style overlay fed by
   * `intelligence-data.ts`; this new set gates the real, addable/removable
   * Sensor Store markers) so both can be toggled independently without
   * colliding.
   */
  sensorMarkers: boolean;
  sensorLabels: boolean;
  sensorStatus: boolean;
  sensorHealth: boolean;
  sensorCoverage: boolean;
  sensorReadings: boolean;
  /**
   * Sensor Analytics overlays — Digital-Twin-compatible
   * heatmaps generated from live/historical sensor readings, reusing the
   * existing farm plot coordinate system. Independent of every layer group
   * above (including the pre-existing `sensorNetwork` static heatmap and the
   * new `sensor*` entity-marker keys from 016A) so all three sensor-related
   * systems can be shown/hidden separately while coexisting.
   */
  analyticsSoilMoistureHeatmap: boolean;
  analyticsTemperatureHeatmap: boolean;
  analyticsHumidityHeatmap: boolean;
  analyticsPhHeatmap: boolean;
  analyticsEcHeatmap: boolean;
  analyticsNpkHeatmap: boolean;
  analyticsTrendVisualization: boolean;
  /** Detected-issue markers from drone/robot mission scans, independent of every layer group above (its own entity type, mirroring the `sensorMarkers` pattern). */
  findingMarkers: boolean;
}

export const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  terrain: true,
  plots: true,
  roads: true,
  trees: true,
  crops: true,
  buildings: true,
  water: true,
  infrastructure: true,
  decorations: true,
  drones: true,
  robots: true,
  // Intelligence overlays start off so the base scene stays clean until asked for.
  cropHealth: false,
  soilMoisture: false,
  temperature: false,
  humidity: false,
  diseaseRisk: false,
  irrigation: false,
  sensorNetwork: false,
  energy: false,
  droneCoverage: false,
  // Mission overlays default on — a mission an operator just created should
  // be visible in the Digital Twin immediately, matching the "must feel
  // like real enterprise UAV planning software" brief.
  missionPaths: true,
  missionBoundaries: true,
  missionWaypoints: true,
  missionWaypointNumbers: true,
  missionCoverage: true,
  missionLabels: true,
  missionCurrentTarget: true,
  // Robot Mission overlays default on too, same rationale.
  robotMissionRoutes: true,
  robotMissionBoundaries: true,
  robotMissionWaypoints: true,
  robotMissionLabels: true,
  robotMissionCoverage: true,
  robotMissionCurrentTarget: true,
  // Sensor entity overlays default on too — a newly added
  // sensor should be visible immediately, same rationale mission overlays use.
  sensorMarkers: true,
  sensorLabels: true,
  sensorStatus: true,
  sensorHealth: true,
  // Off by default — coverage-radius circles for many sensors would clutter
  // the base scene; same "start clean" rationale the intelligence overlays use.
  sensorCoverage: false,
  sensorReadings: true,
  // Analytics heatmaps start off too — opt-in "analysis layers", same
  // rationale the pre-existing intelligence overlays use.
  analyticsSoilMoistureHeatmap: false,
  analyticsTemperatureHeatmap: false,
  analyticsHumidityHeatmap: false,
  analyticsPhHeatmap: false,
  analyticsEcHeatmap: false,
  analyticsNpkHeatmap: false,
  analyticsTrendVisualization: false,
  // Finding markers default on — a mission's detected issues should be
  // visible immediately, same rationale sensor/mission overlays use.
  findingMarkers: true,
};

export interface DisabledLayerItem {
  id: "weather";
  label: string;
}

/** Systems that don't exist yet — shown for context, always off. Robots/Drones/Sensors graduated to real toggles; Weather has its own dedicated control (see `ui/weather-control.tsx`), not a layer toggle. */
export const disabledLayers: DisabledLayerItem[] = [{ id: "weather", label: "Weather" }];

/** Fields, buildings, roads, drones, robots, sensors, and detected findings are selectable; trees/water/decorations/markers are not. */
export type SelectableEntityType = "field" | "building" | "road" | "drone" | "robot" | "sensor" | "finding";

export interface SelectableEntityDetailRow {
  label: string;
  value: string;
}

export interface SelectableEntity {
  id: string;
  type: SelectableEntityType;
  label: string;
  /** Static placeholder line — no real telemetry/backend data this change. */
  meta: string;
  /**
   * Extra label/value rows for entities with richer info than a single meta
   * line (drone/robot). Absent for field/building/road, which render as
   * before. Populated by the Details Panel's own live poll, not baked into
   * the entity at click time — see `ui/details-panel.tsx`.
   */
  details?: SelectableEntityDetailRow[];
}
