"use client";

import { Divider, Panel, Switch, Typography } from "@agrinexus/ui";

import { disabledLayers, type LayerVisibility } from "../types";

const activeLayerItems: { id: keyof LayerVisibility; label: string }[] = [
  { id: "terrain", label: "Terrain" },
  { id: "plots", label: "Plots" },
  { id: "crops", label: "Crops" },
  { id: "roads", label: "Roads" },
  { id: "trees", label: "Trees" },
  { id: "water", label: "Water" },
  { id: "buildings", label: "Buildings" },
  { id: "infrastructure", label: "Infrastructure" },
  { id: "decorations", label: "Decorations" },
  { id: "drones", label: "Drones" },
  { id: "robots", label: "Robots" },
];

/** Visual intelligence overlays — a separate group so they read as "analysis layers" distinct from the base world layers above. */
const intelligenceLayerItems: { id: keyof LayerVisibility; label: string }[] = [
  { id: "cropHealth", label: "Crop Health" },
  { id: "soilMoisture", label: "Soil Moisture" },
  { id: "temperature", label: "Temperature" },
  { id: "humidity", label: "Humidity" },
  { id: "diseaseRisk", label: "Disease Risk" },
  { id: "irrigation", label: "Irrigation" },
  { id: "sensorNetwork", label: "Sensors" },
  { id: "energy", label: "Energy" },
  { id: "droneCoverage", label: "Drone Coverage" },
];

/** Mission Planning overlays — a separate group, same pattern as Intelligence Layers above. */
const missionLayerItems: { id: keyof LayerVisibility; label: string }[] = [
  { id: "missionPaths", label: "Mission Paths" },
  { id: "missionBoundaries", label: "Mission Boundaries" },
  { id: "missionWaypoints", label: "Waypoints" },
  { id: "missionWaypointNumbers", label: "Waypoint Numbers" },
  { id: "missionCoverage", label: "Coverage" },
  { id: "missionLabels", label: "Mission Labels" },
  { id: "missionCurrentTarget", label: "Current Target" },
];

/** Robot Mission Planning overlays — independent toggles from Mission Layers above, so drone and robot missions can be shown/hidden separately. */
const robotMissionLayerItems: { id: keyof LayerVisibility; label: string }[] = [
  { id: "robotMissionRoutes", label: "Robot Routes" },
  { id: "robotMissionBoundaries", label: "Robot Mission Boundaries" },
  { id: "robotMissionWaypoints", label: "Robot Waypoints" },
  { id: "robotMissionLabels", label: "Robot Labels" },
  { id: "robotMissionCoverage", label: "Robot Coverage" },
  { id: "robotMissionCurrentTarget", label: "Robot Current Target" },
];

/** Sensor Network entity overlays — independent toggles from the pre-existing "Sensors" intelligence layer above (that one is the older static heatmap overlay), same pattern Mission/Robot Mission Layers already establish. */
const sensorLayerItems: { id: keyof LayerVisibility; label: string }[] = [
  { id: "sensorMarkers", label: "Sensor Markers" },
  { id: "sensorLabels", label: "Sensor Labels" },
  { id: "sensorStatus", label: "Sensor Status" },
  { id: "sensorHealth", label: "Sensor Health" },
  { id: "sensorCoverage", label: "Sensor Coverage" },
  { id: "sensorReadings", label: "Sensor Readings" },
];

/** Sensor Analytics heatmap overlays — independent toggles, distinct from both the pre-existing "Sensors" intelligence layer and the 016A entity-marker Sensor Layers above. */
const analyticsLayerItems: { id: keyof LayerVisibility; label: string }[] = [
  { id: "analyticsSoilMoistureHeatmap", label: "Soil Moisture Heatmap" },
  { id: "analyticsTemperatureHeatmap", label: "Temperature Heatmap" },
  { id: "analyticsHumidityHeatmap", label: "Humidity Heatmap" },
  { id: "analyticsPhHeatmap", label: "pH Heatmap" },
  { id: "analyticsEcHeatmap", label: "EC Heatmap" },
  { id: "analyticsNpkHeatmap", label: "NPK Heatmap" },
  { id: "analyticsTrendVisualization", label: "Trend Visualization" },
];

/** One toggle for the detected-issue marker layer, mirroring `sensorLayerItems`'s pattern. */
const findingLayerItems: { id: keyof LayerVisibility; label: string }[] = [{ id: "findingMarkers", label: "Inspection Findings" }];

export interface LayerPanelProps {
  layers: LayerVisibility;
  onToggle: (id: keyof LayerVisibility) => void;
}

/** Real toggles for every scene layer that exists, plus the visual intelligence overlays; Weather is shown disabled since it has its own dedicated toolbar control, not a layer toggle. */
export function LayerPanel({ layers, onToggle }: LayerPanelProps) {
  return (
    <Panel variant="glass" padding="sm" className="flex max-h-[65vh] w-56 flex-col gap-3 overflow-y-auto shadow-elevated">
      <Typography variant="caption">Layers</Typography>

      <div className="flex flex-col gap-2.5">
        {activeLayerItems.map((item) => (
          <label key={item.id} className="flex items-center justify-between gap-3 text-sm text-foreground">
            {item.label}
            <Switch checked={layers[item.id]} onCheckedChange={() => onToggle(item.id)} aria-label={item.label} />
          </label>
        ))}
      </div>

      <Divider />

      <Typography variant="caption">Intelligence Layers</Typography>

      <div className="flex flex-col gap-2.5">
        {intelligenceLayerItems.map((item) => (
          <label key={item.id} className="flex items-center justify-between gap-3 text-sm text-foreground">
            {item.label}
            <Switch checked={layers[item.id]} onCheckedChange={() => onToggle(item.id)} aria-label={item.label} />
          </label>
        ))}
      </div>

      <Divider />

      <Typography variant="caption">Mission Layers</Typography>

      <div className="flex flex-col gap-2.5">
        {missionLayerItems.map((item) => (
          <label key={item.id} className="flex items-center justify-between gap-3 text-sm text-foreground">
            {item.label}
            <Switch checked={layers[item.id]} onCheckedChange={() => onToggle(item.id)} aria-label={item.label} />
          </label>
        ))}
      </div>

      <Divider />

      <Typography variant="caption">Robot Mission Layers</Typography>

      <div className="flex flex-col gap-2.5">
        {robotMissionLayerItems.map((item) => (
          <label key={item.id} className="flex items-center justify-between gap-3 text-sm text-foreground">
            {item.label}
            <Switch checked={layers[item.id]} onCheckedChange={() => onToggle(item.id)} aria-label={item.label} />
          </label>
        ))}
      </div>

      <Divider />

      <Typography variant="caption">Sensor Layers</Typography>

      <div className="flex flex-col gap-2.5">
        {sensorLayerItems.map((item) => (
          <label key={item.id} className="flex items-center justify-between gap-3 text-sm text-foreground">
            {item.label}
            <Switch checked={layers[item.id]} onCheckedChange={() => onToggle(item.id)} aria-label={item.label} />
          </label>
        ))}
      </div>

      <Divider />

      <Typography variant="caption">Analytics Layers</Typography>

      <div className="flex flex-col gap-2.5">
        {analyticsLayerItems.map((item) => (
          <label key={item.id} className="flex items-center justify-between gap-3 text-sm text-foreground">
            {item.label}
            <Switch checked={layers[item.id]} onCheckedChange={() => onToggle(item.id)} aria-label={item.label} />
          </label>
        ))}
      </div>

      <Divider />

      <Typography variant="caption">Inspection Layers</Typography>

      <div className="flex flex-col gap-2.5">
        {findingLayerItems.map((item) => (
          <label key={item.id} className="flex items-center justify-between gap-3 text-sm text-foreground">
            {item.label}
            <Switch checked={layers[item.id]} onCheckedChange={() => onToggle(item.id)} aria-label={item.label} />
          </label>
        ))}
      </div>

      <Divider />

      <div className="flex flex-col gap-2.5">
        {disabledLayers.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 text-sm text-foreground-subtle">
            {item.label}
            <Switch checked={false} disabled aria-label={`${item.label} (not yet available)`} />
          </div>
        ))}
      </div>
    </Panel>
  );
}
