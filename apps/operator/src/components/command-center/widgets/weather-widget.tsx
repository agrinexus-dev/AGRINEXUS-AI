"use client";

import { Cloud, CloudSun } from "lucide-react";

import { WeatherCard } from "@agrinexus/ui";

import { useWeatherStore } from "@/lib/weather/weather-store";

/**
 * Reads the same real Weather Store the Weather page and
 * AURA's context both read (`lib/weather/weather-store.ts`), replacing the
 * old hardcoded `DASHBOARD_WEATHER` constant this file used to export
 * No fabricated fallback numbers: while the store hasn't
 * loaded yet, has no farm location configured, or the provider is
 * unavailable, this shows an honest compact placeholder rather than a fake
 * temperature.
 */
export function WeatherWidget() {
  const data = useWeatherStore((state) => state.data);
  const locationConfigured = useWeatherStore((state) => state.locationConfigured);

  if (!data) {
    const label = locationConfigured === false ? "Location not configured" : locationConfigured === null ? "Loading…" : "Unavailable";
    return <WeatherCard condition={label} temperature="—" icon={<Cloud />} />;
  }

  return (
    <WeatherCard
      condition={data.current.conditionText}
      temperature={data.current.temperatureC !== null ? data.current.temperatureC.toFixed(0) : "—"}
      unit="°C"
      icon={<CloudSun />}
      metrics={[
        { label: "Humidity", value: data.current.humidityPercent !== null ? `${data.current.humidityPercent}%` : "—" },
        { label: "Wind", value: data.current.windSpeedKmh !== null ? `${data.current.windSpeedKmh.toFixed(0)} km/h` : "—" },
      ]}
    />
  );
}
