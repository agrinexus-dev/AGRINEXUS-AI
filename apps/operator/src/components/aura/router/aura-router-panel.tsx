"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, X } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  Typography,
  type Status,
} from "@agrinexus/ui";

import { useCollectAuraContext } from "@/lib/aura/context/collect-context";
import type { AuraCapability, AuraEndpointHealthStatus, AuraRouterAttempt, AuraRouterResult } from "@/lib/aura/router/types";
import type { ModelAvailability } from "@/lib/aura/router/model-catalog";
import type { ProviderFailureReason } from "@/lib/aura/providers/provider";
import type { ProviderId } from "@/lib/aura/types";

/**
 * AURA Capability-Aware Routing & Operator-
 * Controlled Fallback Order — the Operator-only router configuration +
 * test panel, redesigned around capability tabs. Only reachable
 * through `/settings`, which `middleware.ts` already restricts to
 * `admin`/`operator`; every API route it calls re-checks the role itself
 * regardless. Never renders an API key.
 *
 * Design: three independent tabs (TEXT / IMAGE / VOICE), each its own
 * drag-and-drop fallback chain (Part "Capability independence" — reordering
 * one tab's chain never touches another's). A capability-agnostic "All
 * Endpoints" section below still handles Add Model, global enable/disable,
 * and permanent removal — deliberately separate from per-capability
 * PARTICIPATION, which each tab controls on its own.
 */

interface ChainEndpointRow {
  id: string;
  provider: ProviderId;
  credentialEnv: string;
  model: string;
  displayName: string;
  enabled: boolean;
  capabilities: AuraCapability[];
  priority: number | null;
  configured: boolean;
  health: AuraEndpointHealthStatus;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastFailureReason: ProviderFailureReason | null;
  latencyMsLastSample: number | null;
  successCount: number;
  failureCount: number;
}

interface CapabilityRoutingResponse {
  capability: AuraCapability;
  chain: ChainEndpointRow[];
  eligibleNotParticipating: ChainEndpointRow[];
  unavailable: ChainEndpointRow[];
}

interface CatalogModelRow {
  model: string;
  displayName: string;
  capabilities: AuraCapability[];
  availability: ModelAvailability;
  note: string;
}

interface CatalogProviderRow {
  provider: ProviderId;
  label: string;
  credentials: { envVar: string; configured: boolean }[];
  models: CatalogModelRow[];
}

const HEALTH_TO_BADGE: Record<AuraEndpointHealthStatus, { status: Status; label: string }> = {
  healthy: { status: "nominal", label: "Healthy" },
  degraded: { status: "attention", label: "Degraded" },
  rate_limited: { status: "attention", label: "Rate limited" },
  unavailable: { status: "critical", label: "Unavailable" },
  misconfigured: { status: "critical", label: "Not configured" },
  disabled: { status: "offline", label: "Disabled" },
  unknown: { status: "info", label: "Not tested yet" },
};

const AVAILABILITY_LABEL: Record<ModelAvailability, string> = {
  available: "Available",
  unstable: "Unstable",
  unavailable: "Unavailable — not verified",
};

const CAPABILITY_LABEL: Record<AuraCapability, string> = {
  text: "Text",
  image: "Image",
  speech_to_text: "Speech-to-Text",
  text_to_speech: "Text-to-Speech",
};
const ALL_CAPABILITIES: AuraCapability[] = ["text", "image", "speech_to_text", "text_to_speech"];

interface AuraSpeechTestResult {
  audioBase64: string;
  mimeType: string;
  endpointId: string;
  provider: ProviderId;
  model: string;
  latencyMs: number;
  fallbackCount: number;
  attempts: AuraRouterAttempt[];
}

interface AuraTranscribeTestResult {
  text: string;
  endpointId: string;
  provider: ProviderId;
  model: string;
  latencyMs: number;
  fallbackCount: number;
  attempts: AuraRouterAttempt[];
}

type TestOutcome =
  | { status: "success"; kind: "text" | "image"; result: AuraRouterResult }
  | { status: "success"; kind: "speech_to_text"; result: AuraTranscribeTestResult }
  | { status: "success"; kind: "text_to_speech"; result: AuraSpeechTestResult }
  | { status: "failure"; message: string; attempts: AuraRouterAttempt[] }
  | { status: "error"; message: string };

type SaveStatus = "idle" | "saving" | "saved" | "error";

function formatTimestamp(ms: number | null): string {
  if (ms === null) return "never";
  const diffMinutes = Math.round((Date.now() - ms) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  return new Date(ms).toLocaleString();
}

export function AuraRouterPanel() {
  const [activeCapability, setActiveCapability] = useState<AuraCapability>("text");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>AURA Router — Fallback Priority</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Typography variant="caption" className="text-foreground-subtle">
            Each capability has its own independent fallback order — reordering TEXT never affects IMAGE, SPEECH-TO-TEXT, or TEXT-TO-SPEECH. Drag ☰
            to reorder; changes save immediately and take effect on AURA&apos;s very next request for that capability.
          </Typography>
          <Tabs value={activeCapability} onValueChange={(value) => setActiveCapability(value as AuraCapability)}>
            <TabsList>
              {ALL_CAPABILITIES.map((capability) => (
                <TabsTrigger key={capability} value={capability}>
                  {CAPABILITY_LABEL[capability]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <CapabilityRoutingSection capability={activeCapability} />
        </CardContent>
      </Card>

      <RouterTestCard />

      <AllEndpointsCard />
    </div>
  );
}

function CapabilityRoutingSection({ capability }: { capability: AuraCapability }) {
  const [data, setData] = useState<CapabilityRoutingResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const load = useCallback(() => {
    fetch(`/api/aura/router/routing/${capability}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((json: CapabilityRoutingResponse) => {
        setData(json);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [capability]);

  useEffect(() => {
    setData(null);
    setSaveStatus("idle");
    load();
  }, [load]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  async function toggleEnabled(endpointId: string, enabled: boolean) {
    setData((current) =>
      current
        ? {
            ...current,
            chain: current.chain.map((endpoint) => (endpoint.id === endpointId ? { ...endpoint, enabled } : endpoint)),
          }
        : current,
    );
    await fetch(`/api/aura/router/endpoints/${endpointId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    load();
  }

  async function setParticipation(endpointId: string, participate: boolean) {
    await fetch(`/api/aura/router/routing/${capability}/participation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpointId, participate }),
    });
    load();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !data) return;

    const oldIndex = data.chain.findIndex((endpoint) => endpoint.id === active.id);
    const newIndex = data.chain.findIndex((endpoint) => endpoint.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...data.chain];
    const [moved] = reordered.splice(oldIndex, 1);
    if (!moved) return;
    reordered.splice(newIndex, 0, moved);
    const withPriority = reordered.map((endpoint, index) => ({ ...endpoint, priority: index + 1 }));
    setData({ ...data, chain: withPriority });
    setSaveStatus("saving");

    try {
      const response = await fetch(`/api/aura/router/routing/${capability}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((endpoint) => endpoint.id) }),
      });
      if (!response.ok) {
        setSaveStatus("error");
        load(); // rollback to server truth.
        return;
      }
      // Part 22 — "after saving, reload configuration from server and verify the saved order."
      const verify = await fetch(`/api/aura/router/routing/${capability}`);
      const verified: CapabilityRoutingResponse = await verify.json();
      setData(verified);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
      load();
    }
  }

  if (loadError) {
    return (
      <Typography variant="small" className="text-critical">
        Couldn&apos;t load {CAPABILITY_LABEL[capability]} routing configuration.
      </Typography>
    );
  }
  if (!data) {
    return (
      <Typography variant="small" className="text-foreground-subtle">
        Loading…
      </Typography>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Typography variant="small" className="text-foreground">
          {CAPABILITY_LABEL[capability]} fallback order
        </Typography>
        <SaveStatusIndicator status={saveStatus} />
      </div>

      {data.chain.length === 0 ? (
        <Typography variant="small" className="text-critical">
          No {capability}-capable endpoints configured.
        </Typography>
      ) : (
        <DndContext id={`aura-router-priority-${capability}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)}>
          <SortableContext items={data.chain.map((endpoint) => endpoint.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {data.chain.map((endpoint) => (
                <CapabilityEndpointRow
                  key={endpoint.id}
                  endpoint={endpoint}
                  onToggleEnabled={toggleEnabled}
                  onRemoveFromChain={() => void setParticipation(endpoint.id, false)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {data.eligibleNotParticipating.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Typography variant="caption" className="text-foreground-subtle">
            Available to add to {CAPABILITY_LABEL[capability]} routing
          </Typography>
          {data.eligibleNotParticipating.map((endpoint) => (
            <div key={endpoint.id} className="flex items-center justify-between rounded-md border border-dashed border-border-subtle bg-surface/30 p-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-foreground">{endpoint.displayName}</span>
                <Badge intent="neutral" className="text-[10px] uppercase">
                  {endpoint.provider}
                </Badge>
                <span className="text-foreground-subtle">{endpoint.credentialEnv}</span>
              </div>
              <Button intent="secondary" size="sm" onClick={() => void setParticipation(endpoint.id, true)}>
                <Plus className="h-3.5 w-3.5" /> Add to chain
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {data.unavailable.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Typography variant="caption" className="text-foreground-subtle">
            Unavailable endpoints — don&apos;t support {CAPABILITY_LABEL[capability]}
          </Typography>
          {data.unavailable.map((endpoint) => (
            <div key={endpoint.id} className="flex items-center justify-between rounded-md border border-border-subtle bg-surface/20 p-2 opacity-60">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-foreground-subtle">{endpoint.displayName}</span>
                <Badge intent="neutral" className="text-[10px] uppercase">
                  {endpoint.provider}
                </Badge>
              </div>
              <Typography variant="caption" className="text-foreground-subtle">
                {endpoint.capabilities.map((capabilityLabel) => CAPABILITY_LABEL[capabilityLabel]).join(" + ")} only
              </Typography>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  if (status === "saving") {
    return (
      <Typography variant="caption" className="text-foreground-subtle">
        Saving…
      </Typography>
    );
  }
  if (status === "saved") {
    return (
      <Typography variant="caption" className="text-success">
        Saved
      </Typography>
    );
  }
  return (
    <Typography variant="caption" className="text-critical">
      Failed to save
    </Typography>
  );
}

function CapabilityEndpointRow({
  endpoint,
  onToggleEnabled,
  onRemoveFromChain,
}: {
  endpoint: ChainEndpointRow;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onRemoveFromChain: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: endpoint.id });
  const badge = HEALTH_TO_BADGE[endpoint.health];
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface/60 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab touch-none text-foreground-subtle hover:text-foreground active:cursor-grabbing"
          aria-label={`Drag to reorder ${endpoint.displayName}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Badge intent="neutral" className="mt-0.5 shrink-0 text-[10px] tabular-nums">
          {endpoint.priority}
        </Badge>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Typography variant="small" className="text-foreground">
              {endpoint.displayName}
            </Typography>
            <Badge intent="neutral" className="text-[10px] uppercase">
              {endpoint.provider}
            </Badge>
            <Badge intent="neutral" className="text-[10px]">
              {endpoint.credentialEnv}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-foreground-subtle">
            {ALL_CAPABILITIES.map((capabilityLabel) => (
              <span key={capabilityLabel} className={endpoint.capabilities.includes(capabilityLabel) ? "text-foreground" : "opacity-40"}>
                {CAPABILITY_LABEL[capabilityLabel]} {endpoint.capabilities.includes(capabilityLabel) ? "✓" : "✗"}
              </span>
            ))}
            <span>·</span>
            <span>Last success: {formatTimestamp(endpoint.lastSuccessAt)}</span>
            {endpoint.latencyMsLastSample !== null ? (
              <>
                <span>·</span>
                <span>{endpoint.latencyMsLastSample}ms</span>
              </>
            ) : null}
            <span>·</span>
            <span className="tabular-nums">
              {endpoint.successCount} ok / {endpoint.failureCount} failed
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge status={badge.status} label={badge.label} />
        <div className="flex items-center gap-1.5">
          <Typography variant="caption" className="text-foreground-subtle">
            Enabled
          </Typography>
          <Switch checked={endpoint.enabled} onCheckedChange={(checked) => onToggleEnabled(endpoint.id, checked)} />
        </div>
        <Button intent="ghost" size="sm" onClick={onRemoveFromChain} aria-label={`Remove ${endpoint.displayName} from this chain`} title="Remove from this capability's chain (does not delete the endpoint)">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** A tiny (well under a second) real audio clip, generated once client-side rather than requiring the Operator to find/upload a file for a routing smoke-test. A REAL WAV file (not a text stand-in) — the same minimal-diagnostic-request spirit as the live Groq Whisper verification. */
function makeSilentTestWavBase64(): string {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * 0.3);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function RouterTestCard() {
  const collectContext = useCollectAuraContext();
  const [capability, setCapability] = useState<AuraCapability>("text");
  const [routing, setRouting] = useState<CapabilityRoutingResponse | null>(null);

  const [message, setMessage] = useState("How many active robots do I have?");
  const [audioFile, setAudioFile] = useState<{ mimeType: string; dataBase64: string; label: string } | null>(null);
  const [mode, setMode] = useState<"automatic" | "manual">("automatic");
  const [manualEndpointId, setManualEndpointId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);

  async function handleAudioFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    setAudioFile({ mimeType: file.type || "audio/wav", dataBase64: btoa(binary), label: file.name });
  }

  function useSampleAudio() {
    setAudioFile({ mimeType: "audio/wav", dataBase64: makeSilentTestWavBase64(), label: "sample-silence.wav (generated)" });
  }

  useEffect(() => {
    setRouting(null);
    fetch(`/api/aura/router/routing/${capability}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((json: CapabilityRoutingResponse) => {
        setRouting(json);
        const manualCandidates = [...json.chain, ...json.eligibleNotParticipating];
        setManualEndpointId((current) => (current && manualCandidates.some((endpoint) => endpoint.id === current) ? current : (manualCandidates[0]?.id ?? null)));
      })
      .catch(() => setRouting(null));
  }, [capability]);

  const manualCandidates = useMemo(() => (routing ? [...routing.chain, ...routing.eligibleNotParticipating] : []), [routing]);
  const displayNameFor = useMemo(() => {
    const map = new Map(manualCandidates.map((endpoint) => [endpoint.id, endpoint]));
    return (endpointId: string) => map.get(endpointId)?.displayName ?? endpointId;
  }, [manualCandidates]);

  async function runTest() {
    setRunning(true);
    setOutcome(null);
    try {
      const payload: Record<string, unknown> = {
        temperature: 0.3,
        capability,
        mode,
        endpointId: mode === "manual" ? (manualEndpointId ?? undefined) : undefined,
      };
      if (capability === "speech_to_text") {
        if (!audioFile) {
          setOutcome({ status: "error", message: "Choose or generate a test audio clip first." });
          setRunning(false);
          return;
        }
        payload.audio = { mimeType: audioFile.mimeType, dataBase64: audioFile.dataBase64 };
      } else {
        payload.message = message;
        if (capability === "text" || capability === "image") payload.context = collectContext();
      }

      const response = await fetch("/api/aura/router/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setOutcome({ status: "error", message: data?.error ?? "Request failed." });
      } else {
        setOutcome(data);
      }
    } catch {
      setOutcome({ status: "error", message: "Could not reach the router test endpoint." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AURA Router Test</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Typography variant="caption" className="text-foreground-subtle">
          Text/Image send the SAME real farm context every other AURA request uses through the router. Speech-to-Text sends a real small audio
          clip and shows the actual transcript; Text-to-Speech sends real text and returns real, playable audio — both genuinely exercise the
          configured endpoint, not just routing selection. Manual mode selects one compatible endpoint with no fallback, for benchmarking, and
          never changes the automatic priority order.
        </Typography>

        {capability === "speech_to_text" ? (
          <div className="flex flex-col gap-1.5">
            <Typography variant="caption" className="text-foreground-subtle">
              Test audio clip
            </Typography>
            <div className="flex flex-wrap items-center gap-2">
              <input type="file" accept="audio/*" onChange={(event) => void handleAudioFileChange(event)} className="text-xs" />
              <Button intent="secondary" size="sm" onClick={useSampleAudio}>
                Use generated sample (silence)
              </Button>
              {audioFile ? (
                <Typography variant="caption" className="text-foreground-subtle">
                  {audioFile.label}
                </Typography>
              ) : null}
            </div>
          </div>
        ) : (
          <label className="flex flex-col gap-1">
            <Typography variant="caption" className="text-foreground-subtle">
              {capability === "text_to_speech" ? "Text to synthesize" : "Message"}
            </Typography>
            <Textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} />
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex flex-col gap-1">
            <Typography variant="caption" className="text-foreground-subtle">
              Capability
            </Typography>
            <Select value={capability} onValueChange={(value) => setCapability(value as AuraCapability)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_CAPABILITIES.map((capabilityOption) => (
                  <SelectItem key={capabilityOption} value={capabilityOption}>
                    {CAPABILITY_LABEL[capabilityOption]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="flex items-center gap-1.5">
            <Button intent={mode === "automatic" ? "primary" : "secondary"} size="sm" onClick={() => setMode("automatic")}>
              Automatic
            </Button>
            <Button intent={mode === "manual" ? "primary" : "secondary"} size="sm" onClick={() => setMode("manual")}>
              Manual
            </Button>
          </div>

          {mode === "manual" ? (
            <Select value={manualEndpointId ?? undefined} onValueChange={setManualEndpointId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select endpoint" />
              </SelectTrigger>
              <SelectContent>
                {manualCandidates.map((endpoint) => (
                  <SelectItem key={endpoint.id} value={endpoint.id}>
                    {endpoint.displayName} · {endpoint.credentialEnv}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Button
            intent="primary"
            size="sm"
            onClick={() => void runTest()}
            disabled={running || (mode === "manual" && !manualEndpointId) || (capability === "speech_to_text" && !audioFile)}
            className="ml-auto"
          >
            {running ? "Running…" : "Run Test"}
          </Button>
        </div>

        {mode === "automatic" && routing && routing.chain.length > 0 ? (
          <div className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface/40 p-2">
            <Typography variant="caption" className="text-foreground-subtle">
              Current {CAPABILITY_LABEL[capability]} automatic order
            </Typography>
            {routing.chain.map((endpoint) => (
              <Typography key={endpoint.id} variant="small" className={endpoint.enabled ? "text-foreground-subtle" : "text-foreground-subtle opacity-50"}>
                Priority {endpoint.priority} → {endpoint.provider} / {endpoint.displayName} {endpoint.enabled ? "" : "(disabled)"}
              </Typography>
            ))}
          </div>
        ) : null}
        {mode === "automatic" && routing && routing.chain.length === 0 ? (
          <Typography variant="small" className="text-critical">
            No {CAPABILITY_LABEL[capability]}-capable endpoints configured — this test will fail.
          </Typography>
        ) : null}

        {outcome ? <TestResult outcome={outcome} displayNameFor={displayNameFor} /> : null}
      </CardContent>
    </Card>
  );
}

function AllEndpointsCard() {
  const [endpoints, setEndpoints] = useState<
    { id: string; provider: ProviderId; credentialEnv: string; model: string; displayName: string; enabled: boolean; capabilities: AuraCapability[]; configured: boolean; health: AuraEndpointHealthStatus }[] | null
  >(null);
  const [loadError, setLoadError] = useState(false);
  const [catalog, setCatalog] = useState<CatalogProviderRow[] | null>(null);
  const [addModelOpen, setAddModelOpen] = useState(false);

  const loadEndpoints = useCallback(() => {
    fetch("/api/aura/router/endpoints")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((data: { endpoints: typeof endpoints extends (infer T)[] | null ? T[] : never }) => {
        setEndpoints(data.endpoints);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    loadEndpoints();
    fetch("/api/aura/router/catalog")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((data: { providers: CatalogProviderRow[] }) => setCatalog(data.providers))
      .catch(() => setCatalog(null));
  }, [loadEndpoints]);

  async function toggleEnabled(endpointId: string, enabled: boolean) {
    setEndpoints((current) => current?.map((endpoint) => (endpoint.id === endpointId ? { ...endpoint, enabled } : endpoint)) ?? current);
    await fetch(`/api/aura/router/endpoints/${endpointId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    loadEndpoints();
  }

  async function removeEndpoint(endpointId: string, label: string) {
    if (!window.confirm(`Permanently remove "${label}" from AURA? This removes it from every capability's routing chain too.`)) return;
    setEndpoints((current) => current?.filter((endpoint) => endpoint.id !== endpointId) ?? current);
    await fetch(`/api/aura/router/endpoints/${endpointId}`, { method: "DELETE" });
    loadEndpoints();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>All Endpoints</CardTitle>
        <Button intent="secondary" size="sm" onClick={() => setAddModelOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Model
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Typography variant="caption" className="text-foreground-subtle">
          Every configured endpoint, regardless of capability. Disabling one here removes it from EVERY capability&apos;s routing immediately —
          use a capability tab above to control participation in just one chain instead.
        </Typography>
        {loadError ? (
          <Typography variant="small" className="text-critical">
            Couldn&apos;t load endpoints.
          </Typography>
        ) : null}
        {(endpoints ?? []).map((endpoint) => (
          <div key={endpoint.id} className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface/40 p-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Typography variant="small" className="text-foreground">
                {endpoint.displayName}
              </Typography>
              <Badge intent="neutral" className="text-[10px] uppercase">
                {endpoint.provider}
              </Badge>
              <Badge intent="neutral" className="text-[10px]">
                {endpoint.credentialEnv}
              </Badge>
              <span className="text-foreground-subtle">{endpoint.capabilities.map((capabilityLabel) => CAPABILITY_LABEL[capabilityLabel]).join(", ")}</span>
              <StatusBadge status={HEALTH_TO_BADGE[endpoint.health].status} label={HEALTH_TO_BADGE[endpoint.health].label} />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Typography variant="caption" className="text-foreground-subtle">
                  Enabled
                </Typography>
                <Switch checked={endpoint.enabled} onCheckedChange={(checked) => void toggleEnabled(endpoint.id, checked)} />
              </div>
              <Button intent="ghost" size="sm" onClick={() => void removeEndpoint(endpoint.id, endpoint.displayName)} aria-label={`Remove ${endpoint.displayName}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      {catalog ? (
        <AddModelDialog
          open={addModelOpen}
          onOpenChange={setAddModelOpen}
          catalog={catalog}
          existing={endpoints ?? []}
          onCreated={() => {
            setAddModelOpen(false);
            loadEndpoints();
          }}
        />
      ) : null}
    </Card>
  );
}

function AddModelDialog({
  open,
  onOpenChange,
  catalog,
  existing,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: CatalogProviderRow[];
  existing: { provider: ProviderId; credentialEnv: string; model: string }[];
  onCreated: () => void;
}) {
  const [provider, setProvider] = useState<ProviderId>(catalog[0]?.provider ?? "gemini");
  const providerEntry = catalog.find((entry) => entry.provider === provider);
  const [credentialEnv, setCredentialEnv] = useState(providerEntry?.credentials[0]?.envVar ?? "");
  const [model, setModel] = useState("");
  const [capabilities, setCapabilities] = useState<AuraCapability[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const firstProvider = catalog[0];
    setProvider(firstProvider?.provider ?? "gemini");
    setCredentialEnv(firstProvider?.credentials[0]?.envVar ?? "");
    setModel("");
    setCapabilities([]);
    setError(null);
  }, [open, catalog]);

  useEffect(() => {
    setCredentialEnv(providerEntry?.credentials[0]?.envVar ?? "");
    setModel("");
    setCapabilities([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const selectedModel = providerEntry?.models.find((entry) => entry.model === model);

  useEffect(() => {
    if (selectedModel) setCapabilities(selectedModel.capabilities);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const alreadyAdded = new Set(existing.filter((endpoint) => endpoint.provider === provider && endpoint.credentialEnv === credentialEnv).map((endpoint) => endpoint.model));
  const selectableModels = providerEntry?.models.filter((entry) => entry.availability !== "unavailable" && !alreadyAdded.has(entry.model)) ?? [];

  async function submit() {
    if (!model || capabilities.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/aura/router/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, credentialEnv, model, capabilities }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Could not add this model.");
        return;
      }
      onCreated();
    } catch {
      setError("Could not reach the router.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Model</DialogTitle>
          <DialogDescription>
            Adds another routable endpoint under an existing credential — no new API key required. Only verified, currently-available models can
            be added. It joins the end of every capability chain it supports by default; remove it from a specific chain afterward if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <Typography variant="caption" className="text-foreground-subtle">
              Provider
            </Typography>
            <Select value={provider} onValueChange={(value) => setProvider(value as ProviderId)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalog.map((entry) => (
                  <SelectItem key={entry.provider} value={entry.provider}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <Typography variant="caption" className="text-foreground-subtle">
              Credential
            </Typography>
            <Select value={credentialEnv} onValueChange={setCredentialEnv}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providerEntry?.credentials.map((credential) => (
                  <SelectItem key={credential.envVar} value={credential.envVar}>
                    {credential.envVar} {credential.configured ? "" : "— not configured"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <Typography variant="caption" className="text-foreground-subtle">
              Model
            </Typography>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger>
                <SelectValue placeholder="Select a verified model" />
              </SelectTrigger>
              <SelectContent>
                {selectableModels.map((entry) => (
                  <SelectItem key={entry.model} value={entry.model}>
                    {entry.displayName} {entry.availability === "unstable" ? "(unstable)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedModel ? (
              <Typography variant="caption" className={selectedModel.availability === "unstable" ? "text-warning" : "text-foreground-subtle"}>
                {AVAILABILITY_LABEL[selectedModel.availability]} — {selectedModel.note}
              </Typography>
            ) : null}
          </label>

          {selectedModel ? (
            <div className="flex flex-col gap-1">
              <Typography variant="caption" className="text-foreground-subtle">
                Capabilities
              </Typography>
              <div className="flex gap-3">
                {ALL_CAPABILITIES.filter((capabilityOption) => selectedModel.capabilities.includes(capabilityOption)).map((capabilityOption) => (
                  <label key={capabilityOption} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={capabilities.includes(capabilityOption)}
                      onCheckedChange={(checked) =>
                        setCapabilities((current) => (checked ? [...current, capabilityOption] : current.filter((value) => value !== capabilityOption)))
                      }
                    />
                    {CAPABILITY_LABEL[capabilityOption]}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <Typography variant="small" className="text-critical">
              {error}
            </Typography>
          ) : null}
        </div>

        <DialogFooter>
          <Button intent="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button intent="primary" size="sm" onClick={() => void submit()} disabled={!model || capabilities.length === 0 || submitting}>
            {submitting ? "Adding…" : "Add to Router"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function usageLine(usage: AuraRouterResult["usage"]): string {
  if (!usage) return "Not reported";
  const part = (value: number | null) => (value === null ? "not reported" : String(value));
  return `input ${part(usage.promptTokens)} · output ${part(usage.completionTokens)} · cached ${part(usage.cachedTokens)}`;
}

function AttemptRow({ attempt, displayNameFor }: { attempt: AuraRouterAttempt; displayNameFor: (id: string) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-subtle bg-surface/40 p-2 text-[11px]">
      <Badge intent="neutral" className="tabular-nums">
        {attempt.priority}
      </Badge>
      <Badge intent={attempt.success ? "success" : "critical"} className="uppercase">
        {attempt.success ? "✓ success" : `✗ ${attempt.failureReason ?? "failed"}`}
      </Badge>
      <span className="text-foreground">{displayNameFor(attempt.endpointId)}</span>
      <span className="text-foreground-subtle">{attempt.model}</span>
      <span className="text-foreground-subtle">{attempt.latencyMs}ms</span>
      {attempt.errorMessage ? <span className="text-foreground-subtle">— {attempt.errorMessage}</span> : null}
    </div>
  );
}

function TestResult({ outcome, displayNameFor }: { outcome: TestOutcome; displayNameFor: (id: string) => string }) {
  if (outcome.status === "error") {
    return (
      <Typography variant="small" className="text-critical">
        {outcome.message}
      </Typography>
    );
  }

  if (outcome.status === "failure") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface/60 p-3">
        <Typography variant="small" className="text-critical">
          Every eligible endpoint failed — {outcome.message}
        </Typography>
        {outcome.attempts.map((attempt, index) => (
          <AttemptRow key={`${attempt.endpointId}-${index}`} attempt={attempt} displayNameFor={displayNameFor} />
        ))}
      </div>
    );
  }

  const { result, kind } = outcome;

  if (kind === "text_to_speech") {
    const audioUrl = `data:${result.mimeType};base64,${result.audioBase64}`;
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface/60 p-3">
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Field label="Capability" value={CAPABILITY_LABEL.text_to_speech} />
          <Field label="Provider" value={result.provider} />
          <Field label="Model" value={result.model} />
          <Field label="Latency" value={`${result.latencyMs}ms`} />
        </div>
        <Field label="Fallbacks" value={String(result.fallbackCount)} />
        {result.attempts.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <Typography variant="caption" className="text-foreground-subtle">
              Attempt chain
            </Typography>
            {result.attempts.map((attempt, index) => (
              <AttemptRow key={`${attempt.endpointId}-${index}`} attempt={attempt} displayNameFor={displayNameFor} />
            ))}
          </div>
        ) : null}
        <audio controls src={audioUrl} className="w-full" />
      </div>
    );
  }

  if (kind === "speech_to_text") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface/60 p-3">
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Field label="Capability" value={CAPABILITY_LABEL.speech_to_text} />
          <Field label="Provider" value={result.provider} />
          <Field label="Model" value={result.model} />
          <Field label="Latency" value={`${result.latencyMs}ms`} />
        </div>
        <Field label="Fallbacks" value={String(result.fallbackCount)} />
        {result.attempts.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <Typography variant="caption" className="text-foreground-subtle">
              Attempt chain
            </Typography>
            {result.attempts.map((attempt, index) => (
              <AttemptRow key={`${attempt.endpointId}-${index}`} attempt={attempt} displayNameFor={displayNameFor} />
            ))}
          </div>
        ) : null}
        <Textarea value={result.text || "(empty transcript)"} readOnly rows={2} className="font-mono text-xs" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface/60 p-3">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Field label="Capability" value={CAPABILITY_LABEL[result.capability]} />
        <Field label="Provider" value={result.provider} />
        <Field label="Model" value={result.model} />
        <Field label="Latency" value={`${result.latencyMs}ms`} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Field label="Fallbacks" value={String(result.fallbackCount)} />
        <Field label="Tokens" value={usageLine(result.usage)} />
      </div>
      {result.attempts.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <Typography variant="caption" className="text-foreground-subtle">
            Attempt chain
          </Typography>
          {result.attempts.map((attempt, index) => (
            <AttemptRow key={`${attempt.endpointId}-${index}`} attempt={attempt} displayNameFor={displayNameFor} />
          ))}
        </div>
      ) : null}
      <Textarea value={result.text} readOnly rows={4} className="font-mono text-xs" />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <Typography variant="caption" className="text-foreground-subtle">
        {label}
      </Typography>
      <Typography variant="small" className="text-foreground">
        {value}
      </Typography>
    </div>
  );
}
