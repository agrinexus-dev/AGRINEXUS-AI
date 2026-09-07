"use client";

import { AlertTriangle } from "lucide-react";

import { Badge, EmptyState, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger, Typography } from "@agrinexus/ui";

import { useActiveAlerts } from "@/lib/sensor-analytics/alert-store";
import { useHistoricalStore } from "@/lib/sensor-analytics/historical-store";
import { ThresholdsPanel } from "./thresholds-panel";
import {
  computeBatteryDegradation,
  computeSensorHealthScore,
  computeSignalStability,
  computeTrendStats,
  detectAnomalies,
  findExtremeReadings,
  findFastestChangingSensor,
} from "@/lib/sensor-analytics/trend-analysis";
import { ALERT_TYPE_LABELS, type AlertSeverity } from "@/lib/sensor-analytics/types";
import { SENSOR_TYPE_LABELS, SENSOR_TYPE_META, type SensorRecord, type SensorType } from "@/lib/sensors/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Typography variant="caption">{title}</Typography>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-foreground-muted">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

const TREND_ARROW: Record<string, string> = { rising: "↑", falling: "↓", stable: "→" };

export interface SensorIntelligencePanelProps {
  sensors: SensorRecord[];
  metricType: SensorType;
}

/** RIGHT PANEL — Sensor Intelligence. Scoped to the same `metricType` the Historical Dashboard is showing, so "Highest Reading"/"Fastest Changing"/etc. compare sensors of the same unit rather than mixing pH with lux. */
export function SensorIntelligencePanel({ sensors, metricType }: SensorIntelligencePanelProps) {
  const samplesBySensorId = useHistoricalStore((state) => state.samples);
  const activeAlerts = useActiveAlerts();
  const matching = sensors.filter((sensor) => sensor.sensorType === metricType);
  const meta = SENSOR_TYPE_META[metricType];

  const entries = matching.map((sensor) => ({ sensor, samples: samplesBySensorId[sensor.id] ?? [] }));
  const { highest, lowest } = findExtremeReadings(entries);
  const fastest = findFastestChangingSensor(entries);

  const gatewayGroups = new Map<string, SensorRecord[]>();
  for (const sensor of sensors) {
    const list = gatewayGroups.get(sensor.gateway) ?? [];
    list.push(sensor);
    gatewayGroups.set(sensor.gateway, list);
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <Typography variant="h4">Sensor Intelligence</Typography>
      <Typography variant="caption" className="text-foreground-subtle">
        Scoped to {SENSOR_TYPE_LABELS[metricType]}
      </Typography>

      <Tabs defaultValue="intelligence" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
          <TabsTrigger value="thresholds">Thresholds & Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="intelligence" className="flex-1 overflow-y-auto pt-1">
          <div className="flex flex-col gap-4">
            {matching.length === 0 ? (
              <EmptyState icon={<AlertTriangle />} title="No sensors of this type" className="py-6" />
            ) : (
              <>
                <Section title="Current Trends">
                  {matching.map((sensor) => {
                    const stats = computeTrendStats(samplesBySensorId[sensor.id] ?? []);
                    return (
                      <Row
                        key={sensor.id}
                        label={sensor.name}
                        value={
                          <span className="flex items-center gap-1">
                            {TREND_ARROW[stats.direction]} {stats.direction} ({stats.strength})
                          </span>
                        }
                      />
                    );
                  })}
                </Section>

                <Section title="Anomaly Detection">
                  {entries.flatMap(({ sensor, samples }) => detectAnomalies(samples).map((anomaly) => ({ sensor, anomaly }))).length === 0 ? (
                    <Typography variant="small">No anomalies detected.</Typography>
                  ) : (
                    entries
                      .flatMap(({ sensor, samples }) => detectAnomalies(samples).slice(-2).map((anomaly) => ({ sensor, anomaly })))
                      .slice(0, 5)
                      .map(({ sensor, anomaly }) => (
                        <Row
                          key={`${sensor.id}-${anomaly.timestamp}`}
                          label={sensor.name}
                          value={`${anomaly.reading.toFixed(meta.decimals)} ${meta.unit} (z=${anomaly.zScore})`}
                        />
                      ))
                  )}
                </Section>

                <Section title="Extremes">
                  <Row label="Highest Reading" value={highest ? `${highest.value.toFixed(meta.decimals)} ${meta.unit} — ${highest.sensorName}` : "—"} />
                  <Row label="Lowest Reading" value={lowest ? `${lowest.value.toFixed(meta.decimals)} ${meta.unit} — ${lowest.sensorName}` : "—"} />
                  <Row label="Fastest Changing" value={fastest ? `${fastest.sensorName} (${fastest.rateOfChange.toFixed(2)} ${meta.unit}/hr)` : "—"} />
                </Section>

                <Section title="Sensor Health Score">
                  {matching.map((sensor) => (
                    <Row
                      key={sensor.id}
                      label={sensor.name}
                      value={computeSensorHealthScore(sensor, detectAnomalies(samplesBySensorId[sensor.id] ?? []).length)}
                    />
                  ))}
                </Section>

                <Section title="Battery Degradation">
                  {matching.map((sensor) => (
                    <Row key={sensor.id} label={sensor.name} value={`${computeBatteryDegradation(samplesBySensorId[sensor.id] ?? [])}%`} />
                  ))}
                </Section>

                <Section title="Signal Stability">
                  {matching.map((sensor) => (
                    <Row key={sensor.id} label={sensor.name} value={`${computeSignalStability(samplesBySensorId[sensor.id] ?? [])}/100`} />
                  ))}
                </Section>
              </>
            )}

            <Section title="Gateway Health">
              {Array.from(gatewayGroups.entries()).map(([gateway, group]) => {
                const online = group.filter((sensor) => sensor.status !== "offline").length;
                return <Row key={gateway} label={gateway} value={`${online}/${group.length} online`} />;
              })}
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="thresholds" className="flex-1 overflow-y-auto pt-1">
          <div className="flex flex-col gap-4">
            <ThresholdsPanel />
            <Section title={`Active Alerts (${activeAlerts.length})`}>
              {activeAlerts.length === 0 ? (
                <Typography variant="small">No active alerts.</Typography>
              ) : (
                activeAlerts.map((alert) => (
                  <div key={alert.id} className="flex flex-col gap-0.5 rounded-md border border-border-subtle p-2">
                    <div className="flex items-center justify-between gap-2">
                      <Typography variant="small" className="font-medium text-foreground">
                        {ALERT_TYPE_LABELS[alert.alertType]}
                      </Typography>
                      <AlertSeverityBadge severity={alert.severity} />
                    </div>
                    <Typography variant="caption" className="text-foreground-subtle">
                      {alert.message}
                    </Typography>
                  </div>
                ))
              )}
            </Section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AlertSeverityBadge({ severity }: { severity: AlertSeverity }) {
  return severity === "critical" ? <StatusBadge status="critical" /> : <Badge intent="warning">Warning</Badge>;
}
