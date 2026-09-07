"use client";

import { BatteryCharging, BatteryWarning, Bot, PlaneTakeoff, Radio, Sun, Wrench, Zap } from "lucide-react";

import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, MetricTile, SectionHeader, StatusBadge, Typography, type Status } from "@agrinexus/ui";

import { DASHBOARD_ENERGY } from "@/components/command-center/widgets/energy-widget";
import { useFleetDrones } from "@/lib/fleet/fleet-store";
import { DRONE_STATUS_LABELS } from "@/lib/fleet/types";
import { useRobots } from "@/lib/robots/robot-store";
import { ROBOT_STATUS_LABELS } from "@/lib/robots/types";
import { useActiveAlerts } from "@/lib/sensor-analytics/alert-store";
import { useSensors } from "@/lib/sensors/sensor-store";

function averageBattery(values: number[]): number | null {
  return values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function batteryStatus(percent: number): Status {
  if (percent < 20) return "critical";
  if (percent < 40) return "attention";
  return "nominal";
}

/**
 * Energy — the sidebar's "Energy" destination. The farm-wide
 * generation/consumption numbers reuse the SAME `DASHBOARD_ENERGY` constant
 * already shared by the Command Center widget and AURA's context
 * (`energy-widget.tsx`) — a static simulated baseline, labeled as such (no
 * live power-meter integration exists). Equipment battery figures below it
 * are real: read straight from the Fleet/Robot/Sensor Stores, which tick on
 * their own simulation intervals independent of this page.
 */
export function EnergyPage() {
  const drones = useFleetDrones();
  const robots = useRobots();
  const sensors = useSensors();
  const activeAlerts = useActiveAlerts();

  const batterySensors = sensors.filter((sensor) => sensor.batteryPowered);
  const lowBatteryAlerts = activeAlerts.filter((alert) => alert.alertType === "low-battery");

  const droneAvgBattery = averageBattery(drones.map((drone) => drone.batteryPercent));
  const robotAvgBattery = averageBattery(robots.map((robot) => robot.batteryPercent));
  const sensorAvgBattery = averageBattery(batterySensors.map((sensor) => sensor.batteryPercent));

  const dronesCharging = drones.filter((drone) => drone.status === "charging").length;
  const robotsCharging = robots.filter((robot) => robot.status === "charging").length;
  const dronesMaintenance = drones.filter((drone) => drone.status === "maintenance").length;
  const robotsMaintenance = robots.filter((robot) => robot.status === "maintenance").length;

  return (
    <div className="flex flex-col gap-5 pb-20">
      <SectionHeader
        title="Energy"
        description="Farm power system (simulated baseline) plus real, live equipment battery levels from the Fleet, Ground Robot, and Sensor stores."
      />

      <Card>
        <CardHeader>
          <CardTitle>Farm Energy System</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricTile label="Solar Output" value={DASHBOARD_ENERGY.solarOutputKw} unit="kW" icon={<Sun />} trend="up" />
            <MetricTile label="Battery Reserve" value={DASHBOARD_ENERGY.batteryPercent} unit="%" icon={<BatteryCharging />} trend="flat" />
            <MetricTile label="Grid Draw" value={DASHBOARD_ENERGY.gridDrawKw} unit="kW" icon={<Zap />} trend="down" />
            <MetricTile label="Today" value={DASHBOARD_ENERGY.todayKwh} unit="kWh" icon={<Zap />} trend="up" />
          </div>
          <Typography variant="caption" className="text-foreground-subtle">
            Simulated baseline — the same fixed values the Command Center &ldquo;Energy&rdquo; widget and AURA&apos;s context read. No real solar
            array or grid meter is connected in this version.
          </Typography>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2">
              <PlaneTakeoff className="size-4 text-foreground-muted" aria-hidden />
              Drone Fleet
            </CardTitle>
            {droneAvgBattery !== null ? <StatusBadge status={batteryStatus(droneAvgBattery)} label={`${droneAvgBattery}% avg`} /> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {drones.length === 0 ? (
              <Typography variant="small" className="text-foreground-muted">
                No drones registered.
              </Typography>
            ) : (
              drones.map((drone) => (
                <div key={drone.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-foreground">{drone.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge intent="neutral">{DRONE_STATUS_LABELS[drone.status]}</Badge>
                    <span className={`font-mono ${drone.batteryPercent < 20 ? "text-critical" : "text-foreground-muted"}`}>
                      {drone.batteryPercent}%
                    </span>
                  </div>
                </div>
              ))
            )}
            <Typography variant="caption" className="mt-1 text-foreground-subtle">
              {dronesCharging} charging · {dronesMaintenance} in maintenance
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-4 text-foreground-muted" aria-hidden />
              Ground Robots
            </CardTitle>
            {robotAvgBattery !== null ? <StatusBadge status={batteryStatus(robotAvgBattery)} label={`${robotAvgBattery}% avg`} /> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {robots.length === 0 ? (
              <Typography variant="small" className="text-foreground-muted">
                No ground robots registered.
              </Typography>
            ) : (
              robots.map((robot) => (
                <div key={robot.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-foreground">{robot.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge intent="neutral">{ROBOT_STATUS_LABELS[robot.status]}</Badge>
                    <span className={`font-mono ${robot.batteryPercent < 20 ? "text-critical" : "text-foreground-muted"}`}>
                      {robot.batteryPercent}%
                    </span>
                  </div>
                </div>
              ))
            )}
            <Typography variant="caption" className="mt-1 text-foreground-subtle">
              {robotsCharging} charging · {robotsMaintenance} in maintenance
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Radio className="size-4 text-foreground-muted" aria-hidden />
              Battery-Powered Sensors
            </CardTitle>
            {sensorAvgBattery !== null ? <StatusBadge status={batteryStatus(sensorAvgBattery)} label={`${sensorAvgBattery}% avg`} /> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {batterySensors.length === 0 ? (
              <Typography variant="small" className="text-foreground-muted">
                No battery-powered sensors registered.
              </Typography>
            ) : (
              batterySensors
                .slice()
                .sort((a, b) => a.batteryPercent - b.batteryPercent)
                .slice(0, 6)
                .map((sensor) => (
                  <div key={sensor.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-foreground">{sensor.name}</span>
                    <span className={`font-mono ${sensor.batteryPercent < 20 ? "text-critical" : "text-foreground-muted"}`}>
                      {sensor.batteryPercent}%
                    </span>
                  </div>
                ))
            )}
            <Typography variant="caption" className="mt-1 text-foreground-subtle">
              {batterySensors.length} of {sensors.length} sensors are battery-powered
            </Typography>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BatteryWarning className="size-4 text-foreground-muted" aria-hidden />
            Energy-Related Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lowBatteryAlerts.length === 0 ? (
            <EmptyState icon={<BatteryCharging />} title="No active battery alerts" description="Every battery-powered unit is currently above its configured threshold." />
          ) : (
            <div className="flex flex-col gap-2">
              {lowBatteryAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface/60 p-3">
                  <div className="flex flex-col">
                    <Typography variant="small" className="text-foreground">
                      {alert.sensorName}
                    </Typography>
                    <Typography variant="caption" className="text-foreground-subtle">
                      {alert.message}
                    </Typography>
                  </div>
                  <StatusBadge status={alert.severity === "critical" ? "critical" : "attention"} label={alert.severity === "critical" ? "Critical" : "Warning"} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="size-4 text-foreground-muted" aria-hidden />
            Historical Energy Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Typography variant="small" className="text-foreground-muted">
            Data unavailable — energy generation/consumption isn&apos;t recorded over time in this version (only sensor readings are tracked
            historically). Equipment battery percentages above are live, but no charge/discharge history is stored yet.
          </Typography>
        </CardContent>
      </Card>
    </div>
  );
}
