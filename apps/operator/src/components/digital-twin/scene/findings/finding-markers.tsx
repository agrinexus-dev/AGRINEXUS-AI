"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Bug, CloudRain, Droplet, Droplets, Flame, Leaf, TriangleAlert, Wheat } from "lucide-react";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import { Panel, StatusBadge, Typography, type Status } from "@agrinexus/ui";

import { useLiveContextStore } from "@/lib/aura/context/live-context-store";
import { useFindingOrder, useFindingStore } from "@/lib/findings/finding-store";
import { CROP_ISSUE_TYPE_LABELS, describeFindingStatus, type CropFinding, type CropIssueSeverity, type CropIssueType } from "@/lib/findings/types";

import type { LayerVisibility, SelectableEntity } from "../../types";

/**
 * Crop-inspection marker layer. Still
 * mirrors `SensorMarkers`' shape (parent subscribes to the id list only,
 * each marker subscribes to its own record) and the SAME canonical
 * `finding.position` every consumer (mini-map, details panel, alert
 * deep-link) reads — no second coordinate system.
 *
 * Part 7 — a RESOLVED finding is removed from this ACTIVE layer (fades out
 * over `FADE_OUT_SECONDS` if the resolution happens live while mounted,
 * skipped entirely if it was already resolved before this marker ever
 * rendered — there's nothing to fade from). The underlying `CropFinding`
 * row is never touched; Analytics/AURA/mission history/the Alerts page
 * keep reading every finding regardless of status, exactly as before.
 */
const POLE_HEIGHT = 0.6;
const HEAD_Y = POLE_HEIGHT;
const LABEL_Y = POLE_HEIGHT + 0.55;
const FADE_OUT_SECONDS = 1.4;

const SEVERITY_COLORS: Record<CropIssueSeverity, string> = {
  low: "#f6ad55",
  medium: "#f0a020",
  high: "#ef4444",
  critical: "#b91c1c",
};

const SEVERITY_BADGE: Record<CropIssueSeverity, Status> = {
  low: "attention",
  medium: "attention",
  high: "critical",
  critical: "critical",
};

// Part 8 — severity-tiered emphasis: higher severity pulses faster/wider
// and renders a touch larger, a non-color cue alongside the palette above
// so severity still reads for a colorblind viewer without relying on hue
// alone (paired with the icon-per-type label below for the same reason).
const SEVERITY_PULSE_SPEED: Record<CropIssueSeverity, number> = { low: 1.2, medium: 1.6, high: 2.2, critical: 3 };
const SEVERITY_PULSE_DEPTH: Record<CropIssueSeverity, number> = { low: 0.15, medium: 0.22, high: 0.32, critical: 0.42 };
const SEVERITY_SCALE: Record<CropIssueSeverity, number> = { low: 0.9, medium: 1, high: 1.1, critical: 1.22 };

// Part 8 — one distinct icon per issue type for the hover/selected label,
// so two markers never read as "the same kind of problem" just because
// they happen to share a severity color.
const ISSUE_ICONS: Record<CropIssueType, typeof Droplet> = {
  "dry-soil": Droplet,
  "nutrient-deficiency": Leaf,
  "weed-growth": Wheat,
  "pest-activity": Bug,
  "fungal-risk": Flame,
  "standing-water": Droplets,
  "crop-stress": TriangleAlert,
  "damaged-crop-area": CloudRain,
};

export interface FindingMarkersProps {
  layers: LayerVisibility;
  selectedId: string | null;
  onSelect: (entity: SelectableEntity) => void;
}

export function FindingMarkers({ layers, selectedId, onSelect }: FindingMarkersProps) {
  const order = useFindingOrder();

  if (!layers.findingMarkers) return null;

  return (
    <group>
      {order.map((id) => (
        <FindingMarker key={id} id={id} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </group>
  );
}

function FindingMarker({ id, selectedId, onSelect }: { id: string; selectedId: string | null; onSelect: (entity: SelectableEntity) => void }) {
  const finding = useFindingStore((state) => state.findings[id]);
  const [hovered, setHovered] = useState(false);
  const poleGeometry = useMemo(() => new THREE.CylinderGeometry(0.025, 0.025, POLE_HEIGHT, 8), []);
  const poleMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4a5058" }), []);
  const headMaterial = useMemo(() => new THREE.MeshStandardMaterial({ transparent: true, toneMapped: false }), []);
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: "#22c55e", transparent: true, side: THREE.DoubleSide }), []);
  const groupRef = useRef<THREE.Group>(null);

  // Part 7 — was this finding ever seen ACTIVE by this marker instance? A
  // finding that loads already-resolved (e.g. from `fetchFindings()` on a
  // fresh page mount) was never active here, so it should never render at
  // all, let alone fade. `wasEverActive` flips true the first time this
  // marker observes `status !== "resolved"`; `fadeElapsed` starts counting
  // only once a LIVE transition to resolved is observed.
  const wasEverActive = useRef(false);
  const fadeElapsed = useRef<number | null>(null);
  const [doneFading, setDoneFading] = useState(false);

  const resolved = finding?.status === "resolved";
  if (finding && !resolved) wasEverActive.current = true;

  useEffect(() => {
    if (resolved && wasEverActive.current && fadeElapsed.current === null) {
      fadeElapsed.current = 0;
    }
    if (!resolved) {
      fadeElapsed.current = null;
      setDoneFading(false);
    }
  }, [resolved]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group || !finding) return;

    if (fadeElapsed.current !== null) {
      fadeElapsed.current += delta;
      const progress = Math.min(1, fadeElapsed.current / FADE_OUT_SECONDS);
      const opacity = 1 - progress;
      headMaterial.opacity = opacity * 0.85;
      ringMaterial.opacity = opacity * 0.7;
      group.scale.setScalar(SEVERITY_SCALE[finding.severity] * (1 - progress * 0.3));
      if (progress >= 1 && !doneFading) setDoneFading(true);
      return;
    }

    if (resolved) return; // already resolved, never active here — nothing to animate
    const pulse = (Math.sin(state.clock.elapsedTime * SEVERITY_PULSE_SPEED[finding.severity]) + 1) / 2;
    headMaterial.emissiveIntensity = 0.45 + pulse * SEVERITY_PULSE_DEPTH[finding.severity] * 2;
    headMaterial.opacity = 1;
    group.scale.setScalar(SEVERITY_SCALE[finding.severity]);
  });

  if (!finding) return null;
  // Part 7 — the actual visibility rule: never render an already-resolved
  // finding that this marker never saw active, and stop rendering once a
  // live fade-out finishes.
  if (resolved && !wasEverActive.current) return null;
  if (doneFading) return null;

  // Captured as its own binding so the nested `handleClick` declaration
  // below keeps TypeScript's narrowed (non-undefined) type — mirrors
  // `SensorMarker`'s identical `record` binding, same reason.
  const record: CropFinding = finding;
  const fading = fadeElapsed.current !== null;

  const selected = selectedId === id;
  const indicatorActive = selected || hovered;
  const color = resolved ? "#6b7280" : SEVERITY_COLORS[record.severity];
  headMaterial.color.set(color);
  headMaterial.emissive.set(color);
  const displayStatus = describeFindingStatus(record);
  const Icon = ISSUE_ICONS[record.issueType];

  function handleClick(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    // Only id/type/label/meta — mirrors `SensorMarker`'s own `handleClick`
    // exactly: the Details Panel reads the rest live from the Finding Store
    // by id (see `selectedFinding` in `ui/details-panel.tsx`), not from a
    // snapshot captured at click time.
    onSelect({
      id: record.id,
      type: "finding",
      label: CROP_ISSUE_TYPE_LABELS[record.issueType],
      meta: `${record.plotLabel} — ${displayStatus}`,
    });
  }

  return (
    <group
      ref={groupRef}
      position={[record.position[0], 0, record.position[1]]}
      onClick={fading ? undefined : handleClick}
      onPointerOver={
        fading
          ? undefined
          : (event) => {
              event.stopPropagation();
              setHovered(true);
              document.body.style.cursor = "pointer";
              useLiveContextStore.getState().publishHover({ id: record.id, type: "finding", label: CROP_ISSUE_TYPE_LABELS[record.issueType] });
            }
      }
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
        useLiveContextStore.getState().publishHover(null);
      }}
    >
      <mesh geometry={poleGeometry} material={poleMaterial} position={[0, POLE_HEIGHT / 2, 0]} />

      {/* A diamond, not a sphere — distinguishes a finding marker from a sensor marker at a glance; the per-type icon in the label below is the finer-grained distinction. */}
      <mesh position={[0, HEAD_Y, 0]} rotation={[0, Math.PI / 4, 0]}>
        <octahedronGeometry args={[0.16, 0]} />
        <primitive object={headMaterial} attach="material" />
      </mesh>

      {/* Resolved (still fading out) additionally gets a small checkmark-style ring at its base — a shape difference, not just a color/opacity change, so it still reads correctly for a colorblind viewer. */}
      {fading ? (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.2, 0.24, 24]} />
          <primitive object={ringMaterial} attach="material" />
        </mesh>
      ) : null}

      {indicatorActive && !fading ? (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.34, 24]} />
          <meshBasicMaterial color="#4fd1c5" transparent opacity={0.85} side={THREE.DoubleSide} />
        </mesh>
      ) : null}

      {indicatorActive && !fading ? (
        <Html position={[0, LABEL_Y, 0]} center distanceFactor={14} zIndexRange={[20, 0]}>
          <Panel variant="glass" padding="sm" className="flex w-52 flex-col gap-1 shadow-elevated">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Icon className="size-3.5 shrink-0" style={{ color }} aria-hidden />
                <Typography variant="small" className="font-medium text-foreground">
                  {CROP_ISSUE_TYPE_LABELS[record.issueType]}
                </Typography>
              </div>
              <StatusBadge status={resolved ? "nominal" : SEVERITY_BADGE[record.severity]} label={resolved ? "resolved" : record.severity} />
            </div>
            <Typography variant="caption" className="text-foreground-subtle">
              {record.plotLabel} — {displayStatus}
            </Typography>
          </Panel>
        </Html>
      ) : null}
    </group>
  );
}
