import { BatteryCharging, Sun, Zap } from "lucide-react";

import { MetricTile } from "@agrinexus/ui";

/** Exported so AURA's Context Engine can read the same energy values this widget renders, instead of duplicating them. */
export const DASHBOARD_ENERGY = {
  solarOutputKw: 4.2,
  batteryPercent: 87,
  gridDrawKw: 0.6,
  todayKwh: 31.5,
};

export function EnergyWidget() {
  return (
    <div className="grid h-full grid-cols-2 gap-2">
      <MetricTile label="Solar Output" value={DASHBOARD_ENERGY.solarOutputKw} unit="kW" icon={<Sun />} trend="up" />
      <MetricTile label="Battery" value={DASHBOARD_ENERGY.batteryPercent} unit="%" icon={<BatteryCharging />} trend="flat" />
      <MetricTile label="Grid Draw" value={DASHBOARD_ENERGY.gridDrawKw} unit="kW" icon={<Zap />} trend="down" />
      <MetricTile label="Today" value={DASHBOARD_ENERGY.todayKwh} unit="kWh" icon={<Zap />} trend="up" />
    </div>
  );
}
