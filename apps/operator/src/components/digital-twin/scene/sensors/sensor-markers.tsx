"use client";

import { useMemo, useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import { Panel, StatusBadge, Typography, type Status } from "@agrinexus/ui";

import { useLiveContextStore } from "@/lib/aura/context/live-context-store";
import { useSensorOrder, useSensorStore } from "@/lib/sensors/sensor-store";
import { formatSensorReading, SENSOR_STATUS_LABELS, SENSOR_TYPE_LABELS, type SensorHealth, type SensorRecord, type SensorStatus } from "@/lib/sensors/types";

import type { LayerVisibility, SelectableEntity } from "../../types";

const POLE_HEIGHT = 0.9;
const HEAD_Y = POLE_HEIGHT;
const RING_Y = 0.03;
const LABEL_Y = POLE_HEIGHT + 0.7;
const COVERAGE_RADIUS = 4;

const SENSOR_STATUS_COLORS: Record<SensorStatus, string> = {
  online: "#3ddc84",
  offline: "#7a8390",
  warning: "#f6ad55",
  critical: "#ef4444",
  maintenance: "#60a5fa",
};

const SENSOR_STATUS_BADGE: Record<SensorStatus, Status> = {
  online: "nominal",
  offline: "offline",
  warning: "attention",
  critical: "critical",
  maintenance: "info",
};

const SENSOR_HEALTH_COLORS: Record<SensorHealth, string> = {
  nominal: "#3ddc84",
  attention: "#f6ad55",
  critical: "#ef4444",
};

export interface SensorMarkersProps {
  layers: LayerVisibility;
  selectedId: string | null;
  onSelect: (entity: SelectableEntity) => void;
}

/**
 * Every sensor the Sensor Store holds, rendered dynamically —
 * mirrors the "one component per record, subscribed independently" shape
 * `RobotMissionOverlays`/`MissionOverlays` already establish, but simpler:
 * sensors are stationary, so there's no route/remount concept at all. The
 * PARENT here only subscribes to the id list (`useSensorOrder`), so
 * add/remove is the only thing that rerenders it; each `SensorMarker` below
 * subscribes to its OWN record only, so a reading/battery/signal tick for
 * one sensor never rerenders any other sensor's marker or this parent —
 * satisfying "sensor updates must NOT rerender the entire Digital Twin."
 */
export function SensorMarkers({ layers, selectedId, onSelect }: SensorMarkersProps) {
  const order = useSensorOrder();

  if (!layers.sensorMarkers) return null;

  return (
    <group>
      {order.map((id) => (
        <SensorMarker key={id} id={id} layers={layers} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </group>
  );
}

function SensorMarker({
  id,
  layers,
  selectedId,
  onSelect,
}: {
  id: string;
  layers: LayerVisibility;
  selectedId: string | null;
  onSelect: (entity: SelectableEntity) => void;
}) {
  const sensor = useSensorStore((state) => state.sensors[id]);
  const [hovered, setHovered] = useState(false);
  const poleGeometry = useMemo(() => new THREE.CylinderGeometry(0.03, 0.03, POLE_HEIGHT, 8), []);
  const poleMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4a5058" }), []);

  if (!sensor) return null;
  // Captured as its own binding so the nested `handleClick` declaration
  // below keeps TypeScript's narrowed (non-undefined) type — control-flow
  // narrowing from the guard above doesn't propagate into nested function
  // declarations.
  const record: SensorRecord = sensor;

  const selected = selectedId === id;
  const indicatorActive = selected || hovered;
  const statusColor = layers.sensorStatus ? SENSOR_STATUS_COLORS[record.status] : "#9aa5b1";

  function handleClick(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    onSelect({ id: record.id, type: "sensor", label: record.name, meta: `${SENSOR_TYPE_LABELS[record.sensorType]} sensor` });
  }

  return (
    <group
      position={[sensor.position[0], 0, sensor.position[1]]}
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
        useLiveContextStore.getState().publishHover({ id: sensor.id, type: "sensor", label: sensor.name });
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
        useLiveContextStore.getState().publishHover(null);
      }}
    >
      <mesh geometry={poleGeometry} material={poleMaterial} position={[0, POLE_HEIGHT / 2, 0]} />

      <mesh position={[0, HEAD_Y, 0]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={0.6} toneMapped={false} />
      </mesh>

      {layers.sensorHealth ? (
        <mesh position={[0, HEAD_Y + 0.24, 0]}>
          <sphereGeometry args={[0.055, 10, 10]} />
          <meshStandardMaterial
            color={SENSOR_HEALTH_COLORS[sensor.health]}
            emissive={SENSOR_HEALTH_COLORS[sensor.health]}
            emissiveIntensity={0.9}
            toneMapped={false}
          />
        </mesh>
      ) : null}

      {layers.sensorCoverage ? (
        <mesh position={[0, RING_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[COVERAGE_RADIUS, 32]} />
          <meshBasicMaterial color={statusColor} transparent opacity={0.08} depthWrite={false} />
        </mesh>
      ) : null}

      {indicatorActive ? (
        <mesh position={[0, RING_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.32, 0.38, 24]} />
          <meshBasicMaterial color="#4fd1c5" transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      ) : null}

      {layers.sensorLabels || layers.sensorReadings ? (
        <Html position={[0, LABEL_Y, 0]} center distanceFactor={14} zIndexRange={[20, 0]}>
          <Panel variant="glass" padding="sm" className="flex w-44 flex-col gap-1 shadow-elevated">
            {layers.sensorLabels ? (
              <div className="flex items-center justify-between gap-2">
                <Typography variant="small" className="font-medium text-foreground">
                  {sensor.name}
                </Typography>
                <StatusBadge status={SENSOR_STATUS_BADGE[sensor.status]} label={SENSOR_STATUS_LABELS[sensor.status]} />
              </div>
            ) : null}
            {layers.sensorReadings ? (
              <Typography variant="caption" className="text-foreground-subtle">
                {formatSensorReading(sensor)}
              </Typography>
            ) : null}
          </Panel>
        </Html>
      ) : null}
    </group>
  );
}
