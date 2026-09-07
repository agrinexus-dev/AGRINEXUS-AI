"use client";

import { useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Switch,
  Textarea,
  type Status,
} from "@agrinexus/ui";

import { useCollectAuraContext } from "@/lib/aura/context/collect-context";
import { useAuraSettingsStore } from "@/lib/aura/client/aura-settings-store";
import { buildSystemPrompt } from "@/lib/aura/prompt/prompt-builder";
import { ALL_PROVIDER_META } from "@/lib/aura/providers/provider-meta";
import type { ProviderConnectionStatus, ProviderId, ProviderStatusResponse } from "@/lib/aura/types";

const STATUS_TO_BADGE: Record<ProviderConnectionStatus, { status: Status; label: string }> = {
  connected: { status: "nominal", label: "Connected" },
  "not-configured": { status: "offline", label: "Not configured" },
  error: { status: "critical", label: "Connection error" },
  "coming-soon": { status: "info", label: "Coming soon" },
};

export function AuraSettingsPanel() {
  const { provider, model, temperature, streamingEnabled, setProvider, setModel, setTemperature, setStreamingEnabled } =
    useAuraSettingsStore();
  const collectContext = useCollectAuraContext();
  const [statuses, setStatuses] = useState<Record<ProviderId, ProviderConnectionStatus> | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/aura/status")
      .then((response) => response.json())
      .then((data: ProviderStatusResponse) => {
        if (!cancelled) setStatuses(data.statuses);
      })
      .catch(() => {
        if (!cancelled) setStatuses(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const activeProviderMeta = ALL_PROVIDER_META.find((meta) => meta.id === provider) ?? ALL_PROVIDER_META[0]!;
  const systemPrompt = buildSystemPrompt(collectContext());

  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-4">
      <Section title="Provider">
        <Select
          value={provider}
          onValueChange={(value) => {
            const nextMeta = ALL_PROVIDER_META.find((meta) => meta.id === value);
            if (nextMeta) setProvider(nextMeta.id, nextMeta.models[0] ?? "");
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_PROVIDER_META.map((meta) => (
              <SelectItem key={meta.id} value={meta.id} disabled={!meta.implemented}>
                {meta.label}
                {!meta.implemented ? " (Coming Soon)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {ALL_PROVIDER_META.map((meta) => {
            const providerStatus = statuses?.[meta.id];
            const badge = providerStatus
              ? STATUS_TO_BADGE[providerStatus]
              : { status: "offline" as Status, label: "Checking…" };
            return (
              <div key={meta.id} className="flex items-center gap-1.5 text-[11px] text-foreground-subtle">
                <span>{meta.label}</span>
                <StatusBadge status={badge.status} label={badge.label} />
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Model">
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {activeProviderMeta.models.map((modelId) => (
              <SelectItem key={modelId} value={modelId}>
                {modelId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      <Section title={`Temperature — ${temperature.toFixed(2)}`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={temperature}
          onChange={(event) => setTemperature(Number(event.target.value))}
          className="w-full accent-accent"
        />
        <div className="flex justify-between text-[11px] text-foreground-subtle">
          <span>Precise</span>
          <span>Creative</span>
        </div>
      </Section>

      <Section title="Streaming responses">
        <div className="flex items-center justify-between">
          <p className="text-xs text-foreground-muted">Show AURA&apos;s reply progressively as it&apos;s generated.</p>
          <Switch checked={streamingEnabled} onCheckedChange={setStreamingEnabled} />
        </div>
      </Section>

      <Section title="System prompt">
        <p className="mb-1.5 text-xs text-foreground-muted">
          Auto-generated from live application context — read-only, sent with every message.
        </p>
        <Textarea value={systemPrompt} readOnly rows={10} className="font-mono text-xs" />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium tracking-wide text-foreground-subtle uppercase">{title}</h3>
      {children}
    </section>
  );
}
