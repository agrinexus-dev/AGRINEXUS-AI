"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { IconButton, Panel, Typography } from "@agrinexus/ui";

import {
  COVERAGE_COLORS,
  COVERAGE_LABELS,
  HEALTH_COLORS,
  HEALTH_LABELS,
  HEALTH_STATUS_ORDER,
  HUMIDITY_LEGEND,
  RISK_COLORS,
  RISK_LABELS,
  SOIL_MOISTURE_LEGEND,
  TEMPERATURE_LEGEND,
} from "../scene/intelligence/intelligence-data";
import type { LayerVisibility } from "../types";

interface LegendEntry {
  label: string;
  color: string;
}

interface LegendSection {
  id: keyof LayerVisibility;
  title: string;
  entries: LegendEntry[];
}

const RISK_LEVELS: (keyof typeof RISK_COLORS)[] = ["low", "moderate", "high"];
const COVERAGE_STATUSES: (keyof typeof COVERAGE_COLORS)[] = ["completed", "pending", "scanning"];

const LEGEND_SECTIONS: LegendSection[] = [
  {
    id: "cropHealth",
    title: "Crop Health",
    entries: HEALTH_STATUS_ORDER.map((status) => ({ label: HEALTH_LABELS[status], color: HEALTH_COLORS[status] })),
  },
  { id: "soilMoisture", title: "Soil Moisture", entries: SOIL_MOISTURE_LEGEND },
  { id: "temperature", title: "Temperature", entries: TEMPERATURE_LEGEND },
  { id: "humidity", title: "Humidity", entries: HUMIDITY_LEGEND },
  {
    id: "diseaseRisk",
    title: "Disease Risk",
    entries: RISK_LEVELS.map((level) => ({ label: RISK_LABELS[level], color: RISK_COLORS[level] })),
  },
  {
    id: "irrigation",
    title: "Irrigation",
    entries: [
      { label: "Active Zone", color: "#2f8fd6" },
      { label: "Inactive Zone", color: "#5c6570" },
      { label: "Flow Path", color: "#bfe6ff" },
    ],
  },
  { id: "sensorNetwork", title: "Sensors", entries: [{ label: "Sensor Node", color: "#38bdf8" }] },
  {
    id: "energy",
    title: "Energy",
    entries: [
      { label: "Solar / Power Flow", color: "#f6c945" },
      { label: "Battery", color: "#2fae4a" },
    ],
  },
  {
    id: "droneCoverage",
    title: "Drone Coverage",
    entries: COVERAGE_STATUSES.map((status) => ({ label: COVERAGE_LABELS[status], color: COVERAGE_COLORS[status] })),
  },
];

export interface IntelligenceLegendProps {
  layers: LayerVisibility;
}

/**
 * Floating legend: automatically shows one color-key section
 * per active intelligence layer, and disappears entirely when none are on
 * — no manual "which layer is selected" state to keep in sync, it just
 * reads the same `layers` object the Layer Manager toggles.
 *
 * Collapsible: with several layers active this panel can
 * grow tall enough to reach the Layer Manager above it, so it can be
 * collapsed down to just its header on demand instead of always taking its
 * full height.
 */
export function IntelligenceLegend({ layers }: IntelligenceLegendProps) {
  const [collapsed, setCollapsed] = useState(false);
  const activeSections = LEGEND_SECTIONS.filter((section) => layers[section.id]);
  if (activeSections.length === 0) return null;

  return (
    <Panel variant="glass" padding="sm" className="flex w-52 flex-col gap-3 shadow-elevated">
      <div className="flex items-center justify-between gap-2">
        <Typography variant="caption">Legend</Typography>
        <IconButton
          aria-label={collapsed ? "Expand legend" : "Collapse legend"}
          icon={collapsed ? <ChevronUp /> : <ChevronDown />}
          intent="ghost"
          size="sm"
          onClick={() => setCollapsed((value) => !value)}
        />
      </div>
      {collapsed ? null : (
        <div className="flex max-h-[42vh] flex-col gap-3 overflow-y-auto">
          {activeSections.map((section) => (
            <div key={section.id} className="flex flex-col gap-1.5">
              <Typography variant="small" className="text-foreground-muted">
                {section.title}
              </Typography>
              <div className="flex flex-col gap-1">
                {section.entries.map((entry) => (
                  <div key={entry.label} className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden />
                    <Typography variant="small" className="text-foreground">
                      {entry.label}
                    </Typography>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
