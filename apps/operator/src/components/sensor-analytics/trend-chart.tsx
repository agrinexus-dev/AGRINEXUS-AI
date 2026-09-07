"use client";

import { useMemo, useRef, useState } from "react";

import { Typography } from "@agrinexus/ui";

export interface ChartPoint {
  timestamp: number;
  value: number;
}

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  points: ChartPoint[];
}

export interface TrendChartProps {
  series: ChartSeries[];
  unit: string;
  /** Only used when there's exactly one series — a light wash under the line (dataviz mark spec: "the series hue at ~10% opacity"). Skipped for comparison mode (2+ series) to avoid overlapping fills reading as clutter. */
  showArea?: boolean;
  height?: number;
}

const MARGIN = { top: 12, right: 16, bottom: 24, left: 44 };
const GRIDLINE_COUNT = 4;

function formatTimestamp(timestamp: number, spanMs: number): string {
  const date = new Date(timestamp);
  if (spanMs <= 26 * 60 * 60 * 1000) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatValue(value: number): string {
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/**
 * A custom SVG line/area chart — no charting library pulled in,
 * same "raw SVG for custom visuals" convention `mini-map.tsx` and the
 * sensor Sparkline already establish. Follows the dataviz
 * mark specs: 2px lines, ~10% opacity area wash (single series only),
 * hairline recessive gridlines, a legend for 2+ series, and a crosshair +
 * shared tooltip on hover (every series' value at that X in one readout).
 */
export function TrendChart({ series, unit, showArea = true, height = 260 }: TrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const width = 720;

  const allPoints = series.flatMap((entry) => entry.points);
  const hasData = allPoints.length > 0;

  const { minTime, maxTime, minValue, maxValue } = useMemo(() => {
    if (!hasData) return { minTime: 0, maxTime: 1, minValue: 0, maxValue: 1 };
    const times = allPoints.map((point) => point.timestamp);
    const values = allPoints.map((point) => point.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const pad = Math.max((rawMax - rawMin) * 0.1, 0.001);
    return { minTime: Math.min(...times), maxTime: Math.max(...times), minValue: rawMin - pad, maxValue: rawMax + pad };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const spanMs = Math.max(1, maxTime - minTime);
  const valueRange = Math.max(1e-9, maxValue - minValue);

  function xFor(timestamp: number): number {
    return MARGIN.left + ((timestamp - minTime) / spanMs) * innerWidth;
  }
  function yFor(value: number): number {
    return MARGIN.top + innerHeight - ((value - minValue) / valueRange) * innerHeight;
  }

  const gridlineValues = Array.from({ length: GRIDLINE_COUNT + 1 }, (_, i) => minValue + (valueRange * i) / GRIDLINE_COUNT);

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = width / rect.width;
    const localX = (event.clientX - rect.left) * scaleX;
    const ratio = Math.min(1, Math.max(0, (localX - MARGIN.left) / innerWidth));
    setHoverX(minTime + ratio * spanMs);
  }

  const hoverEntries =
    hoverX === null
      ? []
      : series
          .map((entry) => {
            if (entry.points.length === 0) return null;
            const nearest = entry.points.reduce((closest, point) => (Math.abs(point.timestamp - hoverX) < Math.abs(closest.timestamp - hoverX) ? point : closest));
            return { series: entry, point: nearest };
          })
          .filter((entry): entry is { series: ChartSeries; point: ChartPoint } => entry !== null);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-border-subtle text-foreground-subtle" style={{ height }}>
        <Typography variant="small">No data for this range yet.</Typography>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverX(null)}
        role="img"
        aria-label={`Trend chart, ${unit}`}
      >
        {gridlineValues.map((value) => (
          <g key={value}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={yFor(value)} y2={yFor(value)} stroke="var(--color-border-subtle)" strokeWidth={1} />
            <text x={MARGIN.left - 8} y={yFor(value)} textAnchor="end" dominantBaseline="middle" className="fill-foreground-subtle" fontSize={10}>
              {formatValue(value)}
            </text>
          </g>
        ))}

        <text x={MARGIN.left} y={height - 4} textAnchor="start" className="fill-foreground-subtle" fontSize={10}>
          {formatTimestamp(minTime, spanMs)}
        </text>
        <text x={width - MARGIN.right} y={height - 4} textAnchor="end" className="fill-foreground-subtle" fontSize={10}>
          {formatTimestamp(maxTime, spanMs)}
        </text>

        {series.map((entry) => {
          if (entry.points.length === 0) return null;
          const linePath = entry.points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(point.timestamp).toFixed(1)} ${yFor(point.value).toFixed(1)}`).join(" ");

          return (
            <g key={entry.id}>
              {showArea && series.length === 1 ? (
                <path
                  d={`${linePath} L ${xFor(entry.points[entry.points.length - 1]!.timestamp).toFixed(1)} ${yFor(minValue).toFixed(1)} L ${xFor(entry.points[0]!.timestamp).toFixed(1)} ${yFor(minValue).toFixed(1)} Z`}
                  fill={entry.color}
                  opacity={0.1}
                  stroke="none"
                />
              ) : null}
              <path d={linePath} fill="none" stroke={entry.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}

        {hoverX !== null ? <line x1={xFor(hoverX)} x2={xFor(hoverX)} y1={MARGIN.top} y2={height - MARGIN.bottom} stroke="var(--color-border)" strokeWidth={1} /> : null}
        {hoverEntries.map(({ series: entry, point }) => (
          <circle key={entry.id} cx={xFor(point.timestamp)} cy={yFor(point.value)} r={4} fill={entry.color} stroke="var(--color-surface)" strokeWidth={2} />
        ))}
      </svg>

      {hoverEntries.length > 0 ? (
        <div
          className="pointer-events-none absolute top-2 flex flex-col gap-1 rounded-md border border-border bg-surface-elevated px-2.5 py-2 text-xs shadow-elevated"
          style={{ left: `${Math.min(78, Math.max(2, ((xFor(hoverX!) / width) * 100))).toFixed(1)}%` }}
        >
          <span className="text-foreground-subtle">{new Date(hoverX!).toLocaleString()}</span>
          {hoverEntries.map(({ series: entry, point }) => (
            <span key={entry.id} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden />
              <span className="font-semibold text-foreground">{formatValue(point.value)}</span>
              <span className="text-foreground-subtle">{unit}</span>
              {series.length > 1 ? <span className="text-foreground-subtle">— {entry.label}</span> : null}
            </span>
          ))}
        </div>
      ) : null}

      {series.length > 1 ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {series.map((entry) => (
            <span key={entry.id} className="flex items-center gap-1.5 text-xs text-foreground-muted">
              <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden />
              {entry.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
