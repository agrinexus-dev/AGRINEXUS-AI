"use client";

import { useState, type ReactElement } from "react";
import { ChevronDown, Cloud, CloudRain, CloudSun, Sun } from "lucide-react";

import { IconButton, Tooltip, TooltipContent, TooltipTrigger } from "@agrinexus/ui";

import { WEATHER_LABELS, WEATHER_PRESETS_ORDER, type WeatherPreset } from "../scene/weather";

export interface WeatherControlProps {
  weather: WeatherPreset;
  onChange: (weather: WeatherPreset) => void;
}

const WEATHER_ICONS: Record<WeatherPreset, ReactElement> = {
  sunny: <Sun />,
  "partly-cloudy": <CloudSun />,
  cloudy: <Cloud />,
  rainy: <CloudRain />,
};

/**
 * Visual-only weather preset switcher — additive, standalone
 * control. Doesn't touch the Toolbar/Layer Manager: it's a new, self-
 * contained widget mounted alongside them, the same way the Mini-map sits
 * next to the Details Panel. No telemetry, no real weather API — just picks
 * which `WeatherConfig` the Scene renders.
 *
 * Collapsible: collapses down to just the current weather
 * icon so it can't sit on top of the Layer Manager's toggles.
 */
export function WeatherControl({ weather, onChange }: WeatherControlProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            aria-label="Expand weather control"
            icon={WEATHER_ICONS[weather]}
            intent="ghost"
            size="sm"
            className="pointer-events-auto rounded-lg border border-border-subtle bg-surface-elevated/80 backdrop-blur-md"
            onClick={() => setCollapsed(false)}
          />
        </TooltipTrigger>
        <TooltipContent side="top">Weather</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border-subtle bg-surface-elevated/80 p-1 backdrop-blur-md">
      {WEATHER_PRESETS_ORDER.map((preset) => (
        <Tooltip key={preset}>
          <TooltipTrigger asChild>
            <IconButton
              aria-label={WEATHER_LABELS[preset]}
              aria-pressed={weather === preset}
              icon={WEATHER_ICONS[preset]}
              intent={weather === preset ? "primary" : "ghost"}
              size="sm"
              onClick={() => onChange(preset)}
            />
          </TooltipTrigger>
          <TooltipContent side="top">{WEATHER_LABELS[preset]}</TooltipContent>
        </Tooltip>
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            aria-label="Collapse weather control"
            icon={<ChevronDown />}
            intent="ghost"
            size="sm"
            onClick={() => setCollapsed(true)}
          />
        </TooltipTrigger>
        <TooltipContent side="top">Collapse</TooltipContent>
      </Tooltip>
    </div>
  );
}
