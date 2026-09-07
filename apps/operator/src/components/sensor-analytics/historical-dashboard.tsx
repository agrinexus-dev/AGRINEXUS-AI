"use client";

import { useMemo, useState } from "react";

import { Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Typography } from "@agrinexus/ui";

import { useHistoricalStore } from "@/lib/sensor-analytics/historical-store";
import { TIME_RANGE_LABELS, TIME_RANGE_MS, type TimeRangeId } from "@/lib/sensor-analytics/types";
import { SENSOR_TYPE_LABELS, SENSOR_TYPE_META, type SensorRecord, type SensorType } from "@/lib/sensors/types";

import { TrendChart, type ChartSeries } from "./trend-chart";

/** The 14 metrics the Historical Analytics Dashboard charts — a subset of the Sensor Store's 18 supported types (wind direction/leaf wetness/flow meter/weather station are table/detail-only, not charted here). */
const ANALYTICS_METRIC_TYPES: SensorType[] = [
  "soil-moisture",
  "soil-temperature",
  "air-temperature",
  "humidity",
  "ph",
  "ec",
  "nitrogen",
  "phosphorus",
  "potassium",
  "rain-gauge",
  "wind-speed",
  "solar-radiation",
  "light-intensity",
  "water-tank-level",
];

// A dark-mode-validated 4-hue categorical set (dataviz skill: slots 1–4,
// re-run through `validate_palette.js --mode dark` for this app's own dark
// surface — all checks pass) — used ONLY for Comparison Mode's overlaid
// sensor lines. The single-sensor view uses the app's own accent color
// instead (sequential form: one hue for one series).
const COMPARISON_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500"];
const SINGLE_SERIES_COLOR = "#4fd1c5";
const MAX_COMPARISON_SENSORS = 4;
const MAX_CHART_POINTS = 360;

function downsample<T>(items: T[], maxPoints: number): T[] {
  if (items.length <= maxPoints) return items;
  const stride = Math.ceil(items.length / maxPoints);
  return items.filter((_, index) => index % stride === 0);
}

export interface HistoricalDashboardProps {
  sensors: SensorRecord[];
  metricType: SensorType;
  onMetricTypeChange: (type: SensorType) => void;
}

/** CENTER PANEL — Historical Analytics Dashboard. `metricType` is lifted to the parent page and shared with `SensorIntelligencePanel` so both panels stay scoped to the same metric — one coherent dashboard, not three independent widgets. */
export function HistoricalDashboard({ sensors, metricType, onMetricTypeChange }: HistoricalDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRangeId>("24h");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [comparisonMode, setComparisonMode] = useState(false);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [comparisonSensorIds, setComparisonSensorIds] = useState<string[]>([]);

  const samplesBySensorId = useHistoricalStore((state) => state.samples);

  const matchingSensors = useMemo(() => sensors.filter((sensor) => sensor.sensorType === metricType), [sensors, metricType]);
  const meta = SENSOR_TYPE_META[metricType];

  const activeSensorId = selectedSensorId && matchingSensors.some((sensor) => sensor.id === selectedSensorId) ? selectedSensorId : (matchingSensors[0]?.id ?? null);

  const [rangeStart, rangeEnd] = useMemo((): [number, number] => {
    const now = Date.now();
    if (timeRange === "custom") {
      const start = customStart ? new Date(customStart).getTime() : now - TIME_RANGE_MS["24h"];
      const end = customEnd ? new Date(customEnd).getTime() : now;
      return [Math.min(start, end), Math.max(start, end)];
    }
    return [now - TIME_RANGE_MS[timeRange], now];
  }, [timeRange, customStart, customEnd]);

  function seriesFor(sensor: SensorRecord, color: string): ChartSeries {
    const samples = samplesBySensorId[sensor.id] ?? [];
    const inRange = samples.filter((sample) => sample.timestamp >= rangeStart && sample.timestamp <= rangeEnd);
    return {
      id: sensor.id,
      label: sensor.name,
      color,
      points: downsample(inRange, MAX_CHART_POINTS).map((sample) => ({ timestamp: sample.timestamp, value: sample.reading })),
    };
  }

  const series: ChartSeries[] = comparisonMode
    ? comparisonSensorIds
        .map((id) => matchingSensors.find((sensor) => sensor.id === id))
        .filter((sensor): sensor is SensorRecord => Boolean(sensor))
        .map((sensor, index) => seriesFor(sensor, COMPARISON_COLORS[index % COMPARISON_COLORS.length]!))
    : activeSensorId
      ? [seriesFor(matchingSensors.find((sensor) => sensor.id === activeSensorId)!, SINGLE_SERIES_COLOR)]
      : [];

  function toggleComparisonSensor(id: string) {
    setComparisonSensorIds((current) => {
      if (current.includes(id)) return current.filter((existing) => existing !== id);
      if (current.length >= MAX_COMPARISON_SENSORS) return current;
      return [...current, id];
    });
  }

  return (
    <Card className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Typography variant="h4">Historical Analytics</Typography>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch checked={comparisonMode} onCheckedChange={setComparisonMode} aria-label="Comparison Mode" />
          Comparison Mode
        </label>
      </div>

      {/* Filters row — date range first, dimension (metric) second, one row above the chart (dataviz skill: "Filters & time ranges"). */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={metricType} onValueChange={(value) => onMetricTypeChange(value as SensorType)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANALYTICS_METRIC_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {SENSOR_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex overflow-hidden rounded-md border border-border">
          {(Object.keys(TIME_RANGE_LABELS) as TimeRangeId[]).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setTimeRange(range)}
              // UI-UPGRADE.3 — was `bg-white/[var(--opacity-hover)]`; see `sensor-table.tsx`'s identical fix.
              className={`px-2.5 py-1.5 text-xs transition-colors duration-(--duration-fast) ease-standard ${
                timeRange === range ? "bg-accent text-accent-foreground" : "bg-surface text-foreground-muted hover:bg-foreground/[var(--opacity-hover)]"
              }`}
            >
              {TIME_RANGE_LABELS[range]}
            </button>
          ))}
        </div>

        {timeRange === "custom" ? (
          <div className="flex items-center gap-1.5">
            <input
              type="datetime-local"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground"
              aria-label="Custom range start"
            />
            <Typography variant="caption">to</Typography>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground"
              aria-label="Custom range end"
            />
          </div>
        ) : null}
      </div>

      {comparisonMode ? (
        <div className="flex flex-wrap items-center gap-2">
          <Typography variant="caption" className="text-foreground-subtle">
            Compare (up to {MAX_COMPARISON_SENSORS}):
          </Typography>
          {matchingSensors.length === 0 ? (
            <Typography variant="small">No sensors of this type yet.</Typography>
          ) : (
            matchingSensors.map((sensor) => {
              const active = comparisonSensorIds.includes(sensor.id);
              return (
                <button
                  key={sensor.id}
                  type="button"
                  onClick={() => toggleComparisonSensor(sensor.id)}
                  // UI-UPGRADE.3 — was `bg-white/[var(--opacity-hover)]`; see `sensor-table.tsx`'s identical fix.
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors duration-(--duration-fast) ease-standard ${
                    active ? "border-accent bg-accent-muted text-foreground" : "border-border text-foreground-muted hover:bg-foreground/[var(--opacity-hover)]"
                  }`}
                >
                  {sensor.name}
                </button>
              );
            })
          )}
        </div>
      ) : (
        <Select value={activeSensorId ?? undefined} onValueChange={setSelectedSensorId} disabled={matchingSensors.length === 0}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder={matchingSensors.length === 0 ? "No sensors of this type" : "Select a sensor"} />
          </SelectTrigger>
          <SelectContent>
            {matchingSensors.map((sensor) => (
              <SelectItem key={sensor.id} value={sensor.id}>
                {sensor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <TrendChart series={series} unit={meta.unit} showArea={!comparisonMode} />
    </Card>
  );
}
