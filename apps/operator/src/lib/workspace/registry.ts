import {
  AlertTriangle,
  BarChart3,
  Bot,
  Boxes,
  CloudSun,
  ListChecks,
  PlaneTakeoff,
  Radio,
  Sparkles,
  Zap,
} from "lucide-react";

import {
  AlertsWidget,
  AnalyticsWidget,
  AuraSummaryWidget,
  DigitalTwinHeroWidget,
  DroneFleetWidget,
  EnergyWidget,
  MissionTimelineWidget,
  RobotFleetWidget,
  SensorNetworkWidget,
  WeatherWidget,
} from "@/components/command-center/widgets";

import type { WidgetDefinition, WidgetId } from "./types";

// A performance audit: an earlier version of this file wrapped
// `DigitalTwinHeroWidget` in `next/dynamic({ ssr: false })` to keep the
// Digital Twin's React Three Fiber/three.js bundle out of Mission Control's
// initial load. Measured result: no change — Next still emits an eager
// `<script async>` tag for a `next/dynamic` chunk the instant it's part of
// a page's rendered tree (this widget is in the default visible grid), so
// the bytes were still fetched on `/`. The actual fix lives inside
// `digital-twin-hero-widget.tsx` itself: it defers its own `import("...
// scene/scene")` to a `useEffect` (a plain runtime import, not
// `next/dynamic`), which only runs after the widget mounts on the client —
// see that file's doc comment for the before/after numbers. This
// registry keeps a normal static import.

/**
 * The Widget Registry: the single place a workspace registers its real
 * component against an id. The Command Center is the first
 * consumer — every entry below now points at a real component instead of
 * the engine's generic "Ready" placeholder body.
 */
export const widgetRegistry: Record<WidgetId, WidgetDefinition> = {
  "digital-twin": { id: "digital-twin", title: "Digital Twin", icon: Boxes, defaultSize: "large", component: DigitalTwinHeroWidget },
  weather: { id: "weather", title: "Weather", icon: CloudSun, defaultSize: "small", component: WeatherWidget },
  "drone-fleet": { id: "drone-fleet", title: "Drone Fleet", icon: PlaneTakeoff, defaultSize: "medium", component: DroneFleetWidget },
  "robot-fleet": { id: "robot-fleet", title: "Robot Fleet", icon: Bot, defaultSize: "medium", component: RobotFleetWidget },
  aura: { id: "aura", title: "AURA", icon: Sparkles, defaultSize: "medium", component: AuraSummaryWidget },
  analytics: { id: "analytics", title: "Analytics", icon: BarChart3, defaultSize: "large", component: AnalyticsWidget },
  energy: { id: "energy", title: "Energy", icon: Zap, defaultSize: "small", component: EnergyWidget },
  "sensor-network": {
    id: "sensor-network",
    title: "Sensor Network",
    icon: Radio,
    defaultSize: "small",
    component: SensorNetworkWidget,
  },
  alerts: { id: "alerts", title: "Alerts", icon: AlertTriangle, defaultSize: "medium", component: AlertsWidget },
  "mission-queue": {
    id: "mission-queue",
    title: "Mission Timeline",
    icon: ListChecks,
    defaultSize: "medium",
    component: MissionTimelineWidget,
  },
};

/** Stable default order: registration order of `widgetRegistry`. */
export const defaultWidgetOrder: WidgetId[] = Object.keys(widgetRegistry) as WidgetId[];
