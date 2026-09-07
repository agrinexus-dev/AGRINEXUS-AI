"use client";

import { useEffect } from "react";
import {
  AlertTriangle,
  Bot,
  Cloud,
  CloudRain,
  CloudSun,
  Droplets,
  Eye,
  Gauge,
  PlaneTakeoff,
  Sprout,
  Sun,
  Wind,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, EmptyState, MetricTile, Panel, SectionHeader, StatusBadge, Typography, WeatherCard } from "@agrinexus/ui";

import type { Status as StatusBadgeStatus } from "@agrinexus/ui";
import { degreesToCompass } from "@/lib/weather/format";
import { fetchWeather, useWeatherHydration, useWeatherStore } from "@/lib/weather/weather-store";
import type { WeatherRiskLevel } from "@/lib/weather/types";

import { FarmLocationSelector } from "./farm-location-selector";

/**
 * Weather — replaces an earlier static-simulation version. Reuses the SAME Weather
 * Store every other consumer reads (`WeatherWidget` on the Command Center,
 * AURA's `collect-context.ts`) — one real Open-Meteo-backed fetch, shared
 * everywhere, never a second weather data source.
 *
 * Structure: Weather
 * Overview → Farm Operating Conditions → Forecast → Agricultural Analysis →
 * Weather Data Status. Every one of the loading/missing-location/
 * provider-unavailable/stale states Part 10 requires is handled explicitly
 * below — never a silent blank page.
 */

const RISK_STATUS: Record<WeatherRiskLevel, StatusBadgeStatus> = {
  favorable: "nominal",
  caution: "attention",
  "high-risk": "critical",
};

const RISK_LABEL: Record<WeatherRiskLevel, string> = {
  favorable: "Favorable",
  caution: "Caution",
  "high-risk": "High Risk",
};

function RiskBadge({ level }: { level: WeatherRiskLevel }) {
  return <StatusBadge status={RISK_STATUS[level]} label={RISK_LABEL[level]} />;
}

function formatWind(speedKmh: number | null, directionDeg: number | null): string {
  if (speedKmh === null) return "Unavailable";
  const dir = directionDeg === null ? "" : ` ${degreesToCompass(directionDeg)}`;
  return `${speedKmh.toFixed(0)} km/h${dir}`;
}

function formatDayLabel(dateStr: string, index: number): string {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function WeatherPage() {
  const { status, error, locationConfigured } = useWeatherHydration();
  const data = useWeatherStore((state) => state.data);
  const stale = useWeatherStore((state) => state.stale);

  useEffect(() => {
    void fetchWeather();
  }, []);

  return (
    <div className="flex flex-col gap-5 pb-20">
      <SectionHeader
        title="Weather"
        description="Real weather data for this farm's configured location, with agricultural operating analysis for drones, ground robots, and field conditions."
      />

      {/* Always visible: shows the currently-saved real-world
          location (or an honest "not configured" prompt) and owns the
          interactive map for selecting/changing it. Independent of the
          weather-loading states below — it reads/writes `/api/farm/location`
          directly, so it stays usable even while Open-Meteo itself is down
          (Part 5 State 7's own requirement: location management shouldn't
          depend on the weather provider's health). */}
      <FarmLocationSelector />

      {status === "loading" || status === "idle" ? <WeatherLoadingState /> : null}

      {status === "loaded" && locationConfigured === false ? <LocationNotConfiguredState /> : null}

      {status === "error" ? <WeatherErrorState message={error} /> : null}

      {status === "loaded" && locationConfigured === true && data ? (
        <>
          {stale ? (
            <Panel variant="subtle" padding="sm" className="flex items-center gap-2 border-warning/40">
              <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
              <Typography variant="small" className="text-foreground-muted">
                The live weather provider couldn&apos;t be reached just now — showing the last successfully fetched data instead. It may not
                reflect current conditions.
              </Typography>
            </Panel>
          ) : null}

          <WeatherOverviewSection />
          <FarmOperatingConditionsSection />
          <ForecastSection />
          <AgriculturalAnalysisSection />
          <WeatherDataStatusSection />
        </>
      ) : null}
    </div>
  );
}

function WeatherLoadingState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 py-12">
        <CloudSun className="size-8 animate-pulse text-foreground-subtle" aria-hidden />
        <Typography variant="small" className="text-foreground-muted">
          Loading weather data…
        </Typography>
      </CardContent>
    </Card>
  );
}

function LocationNotConfiguredState() {
  return (
    <Card>
      <CardContent>
        <EmptyState
          icon={<Cloud />}
          title="Farm location not configured"
          description="Use “Set Farm Location” above to select your farm's real-world position on the map — current conditions, forecast, and agricultural analysis will appear here as soon as it's saved."
        />
      </CardContent>
    </Card>
  );
}

function WeatherErrorState({ message }: { message: string | null }) {
  return (
    <Card>
      <CardContent>
        <EmptyState
          icon={<AlertTriangle />}
          title="Weather data is temporarily unavailable"
          description={message ?? "The weather provider couldn't be reached. This will retry the next time this page loads."}
        />
      </CardContent>
    </Card>
  );
}

function WeatherOverviewSection() {
  const data = useWeatherStore((state) => state.data)!;
  const { current } = data;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <WeatherCard
        condition={current.conditionText}
        temperature={current.temperatureC !== null ? current.temperatureC.toFixed(0) : "—"}
        unit="°C"
        icon={current.isDay === false ? <Cloud /> : <CloudSun />}
        metrics={[
          { label: "Humidity", value: current.humidityPercent !== null ? `${current.humidityPercent}%` : "Unavailable" },
          { label: "Wind", value: formatWind(current.windSpeedKmh, current.windDirectionDeg) },
        ]}
        className="lg:col-span-1"
      />

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Current Conditions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile
            label="Feels Like"
            value={current.apparentTemperatureC !== null ? current.apparentTemperatureC.toFixed(0) : "—"}
            unit={current.apparentTemperatureC !== null ? "°C" : undefined}
            icon={<CloudSun />}
          />
          <MetricTile
            label="Precipitation"
            value={current.precipitationMm !== null ? current.precipitationMm.toFixed(1) : "0.0"}
            unit="mm/hr"
            icon={<CloudRain />}
          />
          <MetricTile label="Wind Gusts" value={current.windGustsKmh !== null ? current.windGustsKmh.toFixed(0) : "Unavailable"} unit={current.windGustsKmh !== null ? "km/h" : undefined} icon={<Wind />} />
          <MetricTile label="Visibility" value="Not provided" icon={<Eye />} />
        </CardContent>
      </Card>
    </div>
  );
}

function FarmOperatingConditionsSection() {
  const data = useWeatherStore((state) => state.data)!;
  const { analysis } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Farm Operating Conditions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3">
          <div className="flex items-center gap-2">
            <PlaneTakeoff className="size-4 text-foreground-muted" aria-hidden />
            <Typography variant="small" className="text-foreground">
              Drone
            </Typography>
          </div>
          <RiskBadge level={analysis.droneOperations.level} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-foreground-muted" aria-hidden />
            <Typography variant="small" className="text-foreground">
              Ground Robot
            </Typography>
          </div>
          <RiskBadge level={analysis.robotOperations.level} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3">
          <div className="flex items-center gap-2">
            <Sprout className="size-4 text-foreground-muted" aria-hidden />
            <Typography variant="small" className="text-foreground">
              Field
            </Typography>
          </div>
          <RiskBadge level={analysis.fieldConditions.level} />
        </div>
      </CardContent>
      <CardContent className="flex flex-col gap-1.5 pt-0">
        <Typography variant="caption" className="text-foreground-subtle">
          {analysis.droneOperations.reason}
        </Typography>
        <Typography variant="caption" className="text-foreground-subtle">
          {analysis.robotOperations.reason}
        </Typography>
        <Typography variant="caption" className="text-foreground-subtle">
          {analysis.fieldConditions.reason}
        </Typography>
      </CardContent>
    </Card>
  );
}

function ForecastSection() {
  const data = useWeatherStore((state) => state.data)!;

  if (data.forecast.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={<CloudSun />} title="Forecast unavailable" description="The weather provider didn't return forecast data for this location." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forecast</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="flex gap-3">
          {data.forecast.map((day, index) => (
            <div key={day.date} className="flex w-36 shrink-0 flex-col gap-2 rounded-lg border border-border-subtle bg-surface/60 p-3">
              <Typography variant="small" className="font-medium text-foreground">
                {formatDayLabel(day.date, index)}
              </Typography>
              <Typography variant="caption" className="text-foreground-subtle">
                {day.conditionText}
              </Typography>
              <Typography variant="body" className="font-mono text-foreground">
                {day.tempMaxC !== null ? day.tempMaxC.toFixed(0) : "—"}° / {day.tempMinC !== null ? day.tempMinC.toFixed(0) : "—"}°
              </Typography>
              <div className="flex items-center gap-1.5 text-foreground-muted">
                <Droplets className="size-3.5 shrink-0" aria-hidden />
                <Typography variant="caption">
                  {day.precipitationProbabilityPercent !== null ? `${day.precipitationProbabilityPercent}% chance` : "Unavailable"}
                </Typography>
              </div>
              <div className="flex items-center gap-1.5 text-foreground-muted">
                <Wind className="size-3.5 shrink-0" aria-hidden />
                <Typography variant="caption">{day.windSpeedMaxKmh !== null ? `${day.windSpeedMaxKmh.toFixed(0)} km/h` : "Unavailable"}</Typography>
              </div>
              {day.uvIndexMax !== null ? (
                <div className="flex items-center gap-1.5 text-foreground-muted">
                  <Sun className="size-3.5 shrink-0" aria-hidden />
                  <Typography variant="caption">UV {day.uvIndexMax.toFixed(0)}</Typography>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AgriculturalAnalysisSection() {
  const data = useWeatherStore((state) => state.data)!;
  const { analysis } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agricultural Analysis</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AnalysisRow icon={<CloudRain />} label="Rain Risk" factor={analysis.rainRisk} />
          <AnalysisRow icon={<Wind />} label="Wind Risk" factor={analysis.windRisk} />
          <AnalysisRow icon={<Gauge />} label="Heat Risk" factor={analysis.heatRisk} />
          <AnalysisRow icon={<Droplets />} label="Irrigation Consideration" factor={analysis.irrigationConsideration} />
        </div>

        <Panel variant="subtle" padding="sm" className="flex flex-col gap-1.5">
          <Typography variant="caption" className="text-foreground-subtle">
            Mission Notes
          </Typography>
          {analysis.missionNotes.map((note, i) => (
            <Typography key={i} variant="small" className="text-foreground-muted">
              {note}
            </Typography>
          ))}
          <Typography variant="caption" className="mt-1 text-foreground-subtle">
            Informational only — weather is never used to automatically cancel, modify, or dispatch missions.
          </Typography>
        </Panel>
      </CardContent>
    </Card>
  );
}

function AnalysisRow({ icon, label, factor }: { icon: React.ReactNode; label: string; factor: { level: WeatherRiskLevel; reason: string } }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-surface/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex text-foreground-muted [&_svg]:size-3.5" aria-hidden>
            {icon}
          </span>
          <Typography variant="small" className="text-foreground">
            {label}
          </Typography>
        </div>
        <RiskBadge level={factor.level} />
      </div>
      <Typography variant="caption" className="text-foreground-subtle">
        {factor.reason}
      </Typography>
    </div>
  );
}

function WeatherDataStatusSection() {
  const data = useWeatherStore((state) => state.data)!;
  const stale = useWeatherStore((state) => state.stale);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weather Data Status</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricTile label="Last Updated" value={new Date(data.fetchedAt).toLocaleTimeString()} icon={<CloudSun />} />
        <MetricTile label="Data Source" value={data.source} icon={<Cloud />} />
        <MetricTile label="Status" value={stale ? "Stale (cached)" : "Live"} icon={<Gauge />} />
      </CardContent>
    </Card>
  );
}
