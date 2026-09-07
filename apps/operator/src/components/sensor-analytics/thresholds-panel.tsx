"use client";

import { RotateCcw } from "lucide-react";

import { IconButton, Input, Tooltip, TooltipContent, TooltipTrigger, Typography } from "@agrinexus/ui";

import { useThresholdStore } from "@/lib/sensor-analytics/threshold-store";
import { THRESHOLD_METRIC_LABELS, type ThresholdMetric } from "@/lib/sensor-analytics/types";

const METRICS: ThresholdMetric[] = ["soil-moisture", "humidity", "temperature", "battery", "signal"];

/** Threshold configuration ("Thresholds") — Min/Max/Target per metric, read by the Smart Alerts ticker (`use-alert-simulation.ts`) so what's shown here and what triggers an alert always agree. */
export function ThresholdsPanel() {
  const thresholds = useThresholdStore((state) => state.thresholds);
  const updateThreshold = useThresholdStore((state) => state.updateThreshold);
  const resetThreshold = useThresholdStore((state) => state.resetThreshold);

  return (
    <div className="flex flex-col gap-3">
      <Typography variant="caption">Thresholds</Typography>
      {METRICS.map((metric) => {
        const config = thresholds[metric];
        return (
          <div key={metric} className="flex flex-col gap-1.5 rounded-md border border-border-subtle p-2">
            <div className="flex items-center justify-between">
              <Typography variant="small" className="font-medium text-foreground">
                {THRESHOLD_METRIC_LABELS[metric]}
              </Typography>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton aria-label={`Reset ${THRESHOLD_METRIC_LABELS[metric]} threshold`} icon={<RotateCcw />} intent="ghost" size="sm" onClick={() => resetThreshold(metric)} />
                </TooltipTrigger>
                <TooltipContent side="top">Reset to default</TooltipContent>
              </Tooltip>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <NumberField label="Min" value={config.min} onChange={(value) => updateThreshold(metric, { min: value })} />
              <NumberField label="Max" value={config.max} onChange={(value) => updateThreshold(metric, { max: value })} />
              <NumberField label="Target" value={config.target} onChange={(value) => updateThreshold(metric, { target: value })} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase text-foreground-subtle">{label}</span>
      <Input
        type="number"
        value={value}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
        className="h-7 px-1.5 text-xs"
      />
    </label>
  );
}
