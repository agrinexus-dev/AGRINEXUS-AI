"use client";

import { useState } from "react";
import { LocateFixed, RadioTower, RotateCcw, Sliders, Trash2, Wrench } from "lucide-react";

import { Button, Card, Divider, EmptyState, StatusBadge, Typography } from "@agrinexus/ui";

import { locateSensorInDigitalTwin } from "@/lib/aura/actions/action-bridge-store";
import { COMMUNICATION_TYPE_LABELS } from "@/lib/fleet/types";
import { sensorPlotLabel, useSensorStore } from "@/lib/sensors/sensor-store";
import { formatSensorReading, SENSOR_STATUS_LABELS, SENSOR_TYPE_LABELS, SENSOR_TYPE_META, type SensorRecord } from "@/lib/sensors/types";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Typography variant="small">{label}</Typography>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Typography variant="caption">{title}</Typography>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

/** A tiny inline sparkline — no charting library pulled in for a single small trend line, same "raw SVG for small custom visuals" convention `mini-map.tsx` already uses. */
function Sparkline({ values, min, max }: { values: number[]; min: number; max: number }) {
  if (values.length < 2) return <Typography variant="small">Not enough history yet.</Typography>;

  const width = 240;
  const height = 48;
  const range = Math.max(1e-6, max - min);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-full" aria-hidden>
      <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * RIGHT PANEL — Sensor Details. Lives on the Sensor Network
 * page only, mirroring `RobotDetailsPanel`'s role for the Ground Robots
 * page — the Digital Twin's own compact `DetailsPanel` stays untouched
 * (only additively extended, never redesigned).
 */
export function SensorDetailsPanel({ sensor }: { sensor: SensorRecord | null }) {
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    if (!sensor) return;
    setRemoveError(null);
    setRemoving(true);
    try {
      // Awaited — `removeSensor` only clears the sensor from
      // this store once the database row is genuinely gone, so a failed
      // delete never silently leaves a "removed" sensor that a page refresh
      // would bring right back ("do NOT silently leave broken
      // foreign keys" / don't fabricate a removal that didn't happen).
      await useSensorStore.getState().removeSensor(sensor.id);
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "Couldn't remove this sensor — please try again.");
      setRemoving(false);
    }
  }

  if (!sensor) {
    return (
      <Card className="flex h-full items-center justify-center p-0">
        <EmptyState icon={<RadioTower />} title="No sensor selected" description="Select a sensor from the table to see its details." className="border-none" />
      </Card>
    );
  }

  const meta = SENSOR_TYPE_META[sensor.sensorType];
  const inMaintenance = sensor.status === "maintenance";
  const plotLabel = sensorPlotLabel(sensor);

  return (
    <Card className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <Typography variant="h4">{sensor.name}</Typography>
          <Typography variant="caption">{SENSOR_TYPE_LABELS[sensor.sensorType]}</Typography>
        </div>
        <StatusBadge status={sensor.health} />
      </div>

      <Section title="General">
        <Row label="Sensor ID" value={sensor.id} />
        <Row label="Sensor Type" value={SENSOR_TYPE_LABELS[sensor.sensorType]} />
        <Row label="Status" value={SENSOR_STATUS_LABELS[sensor.status]} />
        <Row label="Assigned Plot" value={plotLabel ?? "None"} />
        <Row label="Location" value={`x=${sensor.position[0].toFixed(1)}, z=${sensor.position[1].toFixed(1)}`} />
      </Section>

      <Divider />

      <Section title="Connectivity">
        <Row label="Battery" value={`${sensor.batteryPercent}%`} />
        <Row label="Signal Strength" value={`${sensor.signalPercent}%`} />
        <Row label="Gateway" value={sensor.gatewayConnected ? sensor.gateway : "Disconnected"} />
        <Row label="Communication" value={COMMUNICATION_TYPE_LABELS[sensor.communicationType]} />
        <Row label="Firmware" value={sensor.firmwareVersion} />
        <Row label="Sampling Rate" value={`${sensor.samplingIntervalSeconds}s`} />
        <Row label="Installation Date" value={new Date(sensor.installedAt).toLocaleDateString()} />
      </Section>

      <Divider />

      <Section title="Reading">
        <Row label="Current Reading" value={formatSensorReading(sensor)} />
        <Sparkline values={sensor.readingHistory} min={meta.min} max={meta.max} />
      </Section>

      <Divider />

      <div className="grid grid-cols-2 gap-2">
        <Button
          intent="secondary"
          leadingIcon={<LocateFixed />}
          onClick={() => locateSensorInDigitalTwin(sensor.id)}
        >
          Locate
        </Button>
        <Button intent="secondary" leadingIcon={<Sliders />} onClick={() => useSensorStore.getState().calibrateSensor(sensor.id)}>
          Calibrate
        </Button>
        <Button intent="secondary" leadingIcon={<RotateCcw />} onClick={() => useSensorStore.getState().restartSensor(sensor.id)}>
          Restart
        </Button>
        <Button
          intent={inMaintenance ? "primary" : "secondary"}
          leadingIcon={<Wrench />}
          onClick={() => useSensorStore.getState().setMaintenanceMode(sensor.id, !inMaintenance)}
        >
          {inMaintenance ? "Exit Maintenance" : "Maintenance"}
        </Button>
        <Button
          intent="destructive"
          leadingIcon={<Trash2 />}
          className="col-span-2"
          loading={removing}
          onClick={() => void handleRemove()}
        >
          Remove Sensor
        </Button>
      </div>

      {removeError ? (
        <Typography variant="small" className="text-critical" role="alert">
          {removeError}
        </Typography>
      ) : null}
    </Card>
  );
}
