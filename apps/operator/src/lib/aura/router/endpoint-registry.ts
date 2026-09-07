import "server-only";

import { prisma } from "@/lib/prisma/client";
import { chatWithApiKey, streamWithApiKey, synthesizeSpeechWithApiKey } from "../providers/gemini-provider";
import { chatWithGroqApiKey, streamWithGroqApiKey, transcribeWithGroqApiKey } from "../providers/groq-provider";
import { chatWithOpenRouterApiKey, streamWithOpenRouterApiKey } from "../providers/openrouter-provider";
import { ProviderTemporaryError, type ProviderFailureReason, type ProviderUsage } from "../providers/provider";
import type { ProviderId } from "../types";
import type { AuraCapability, AuraEndpointConfig, AuraEndpointHealthStatus, AuraProviderAdapter } from "./types";
import { findCatalogModel, getCatalogForProvider } from "./model-catalog";

/**
 * AURA Dynamic Provider + Model Routing Control
 * Center — the durable, Operator-editable replacement for the earlier
 * in-memory `AURA_ENDPOINTS`/`AURA_ROUTING_ORDER` arrays. Every routable
 * endpoint (one provider + one credential env var + one model) is now a row
 * in Postgres's `AuraRouteEndpoint` table (see `schema.prisma`'s own doc
 * comment on that model for the full rationale), read fresh on every
 * request — no long-lived in-memory cache of the CONFIGURATION itself, so a
 * drag-and-drop reorder or an enable/disable toggle takes effect on the
 * very next request, per the "the live router must immediately
 * use the new order" success criterion. RUNTIME HEALTH (last success/
 * failure, latency, counts) remains in-memory by deliberate choice
 * ("avoid unnecessary DB complexity" for a
 * lightweight diagnostic that doesn't need to survive a restart to be
 * useful, unlike the routing CONFIGURATION itself, which now does).
 */

interface EndpointRow {
  id: string;
  provider: string;
  credentialEnv: string;
  model: string;
  displayName: string;
  capabilities: string[];
  enabled: boolean;
  priority: number;
}

function toEndpointConfig(row: EndpointRow): AuraEndpointConfig {
  return {
    id: row.id,
    provider: row.provider as ProviderId,
    model: row.model,
    displayName: row.displayName,
    enabled: row.enabled,
    capabilities: row.capabilities as AuraCapability[],
    apiKeyEnvVar: row.credentialEnv,
  };
}

/**
 * The exact 5 endpoints already live-configured earlier,
 * reshaped into the new provider+credential+model rows, in the SAME
 * priority order `AURA_ROUTING_ORDER.text` already used — a genuinely
 * behavior-preserving migration (Part "Backward Compatibility": "existing
 * configurations should migrate safely"). Runs exactly once, only if the
 * table is empty — an Operator who has already customized their routing
 * (added/reordered/disabled anything) never has this touch their data
 * again.
 */
const DEFAULT_SEED: Omit<EndpointRow, "id">[] = [
  { provider: "gemini", credentialEnv: "GEMINI_API_KEY", model: "gemini-3.6-flash", displayName: "Gemini 3.6 Flash", capabilities: ["text", "image"], enabled: true, priority: 1 },
  { provider: "groq", credentialEnv: "GROQ_API_KEY", model: "openai/gpt-oss-20b", displayName: "GPT-OSS 20B", capabilities: ["text"], enabled: true, priority: 2 },
  { provider: "gemini", credentialEnv: "GEMINI_2_API_KEY", model: "gemini-3.5-flash", displayName: "Gemini 3.5 Flash", capabilities: ["text", "image"], enabled: true, priority: 3 },
  { provider: "gemini", credentialEnv: "GEMINI_3_API_KEY", model: "gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash-Lite", capabilities: ["text", "image"], enabled: true, priority: 4 },
  { provider: "openrouter", credentialEnv: "OPENROUTER_API_KEY", model: "nvidia/nemotron-3-super-120b-a12b:free", displayName: "Nemotron 3 Super 120B (Free)", capabilities: ["text"], enabled: true, priority: 5 },
];

let seeded: Promise<void> | null = null;

function ensureSeeded(): Promise<void> {
  seeded ??= (async () => {
    const count = await prisma.auraRouteEndpoint.count();
    if (count > 0) return;
    await prisma.auraRouteEndpoint.createMany({ data: DEFAULT_SEED });
  })();
  return seeded;
}

/**
 * The per-capability
 * default seed, run exactly once (only if NO `AuraRouteCapabilityPriority`
 * row exists anywhere yet — i.e. an environment upgrading from an
 * earlier router, or a genuinely first-ever run). Deliberately does NOT hardcode a literal
 * endpoint list ("do not hard-code unsupported capabilities... if
 * the actual existing metadata differs, derive the defaults from the
 * existing provider metadata") — it derives each capability's default order
 * from whatever `AuraRouteEndpoint` rows already exist, in their existing
 * global `priority` order, filtered to only the endpoints whose OWN
 * `capabilities` array already includes that capability. For an
 * environment continuing straight from the earlier seed, this reproduces
 * EXACTLY the old `AURA_ROUTING_ORDER` (text: all 5
 * in existing order; image: the 3 gemini endpoints only, in existing
 * relative order; voice: empty, since no endpoint declares that
 * capability) — a genuinely non-breaking migration, not a guess.
 */
async function ensureCapabilityPrioritiesSeeded(): Promise<void> {
  const count = await prisma.auraRouteCapabilityPriority.count();
  if (count > 0) return;

  const endpoints = await prisma.auraRouteEndpoint.findMany({ orderBy: { priority: "asc" } });
  if (endpoints.length === 0) return;

  const rows: { endpointId: string; capability: string; priority: number }[] = [];
  for (const capability of ["text", "image", "speech_to_text", "text_to_speech"] as const) {
    let nextPriority = 1;
    for (const endpoint of endpoints) {
      if (!endpoint.capabilities.includes(capability)) continue;
      rows.push({ endpointId: endpoint.id, capability, priority: nextPriority });
      nextPriority += 1;
    }
  }
  if (rows.length > 0) await prisma.auraRouteCapabilityPriority.createMany({ data: rows });
}

let capabilitiesSeeded: Promise<void> | null = null;

function ensureCapabilitySeedRun(): Promise<void> {
  capabilitiesSeeded ??= ensureSeeded().then(ensureCapabilityPrioritiesSeeded);
  return capabilitiesSeeded;
}

/** Every configured endpoint (capability-agnostic), in the Operator's own management-list display order — NOT the routing order (see `listEndpointsForCapability` for that). Backs the "all endpoints" Add Model/enable/disable/remove view. */
export async function listAllEndpoints(): Promise<AuraEndpointConfig[]> {
  await ensureCapabilitySeedRun();
  const rows = await prisma.auraRouteEndpoint.findMany({ orderBy: { priority: "asc" } });
  return rows.map(toEndpointConfig);
}

export interface CapabilityChainEntry {
  endpoint: AuraEndpointConfig;
  priority: number;
}

/**
 * THE routing chain `aura-router.ts` actually uses
 * for a given capability: every endpoint with a real
 * `AuraRouteCapabilityPriority` row for this capability, ordered by that
 * row's own `priority`, joined to its full endpoint config. An endpoint
 * with no row for this capability simply isn't in the chain — whether or
 * not it structurally supports the capability, per Part 11's "capability
 * routing participation is a separate concept from global enable/disable."
 * The router's own loop still re-checks `endpoint.enabled` and
 * `endpoint.capabilities.includes(capability)` per attempt (defense in
 * depth against a row that's gone stale relative to the endpoint it points
 * to — Part 7: "must remain true even if an invalid configuration is
 * manually submitted").
 */
export async function listEndpointsForCapability(capability: AuraCapability): Promise<AuraEndpointConfig[]> {
  await ensureCapabilitySeedRun();
  const rows = await prisma.auraRouteCapabilityPriority.findMany({
    where: { capability },
    orderBy: { priority: "asc" },
    include: { endpoint: true },
  });
  return rows.map((row) => toEndpointConfig(row.endpoint));
}

/**
 * The full picture one capability tab in the Operator UI needs: the
 * ordered participating chain, plus every OTHER configured endpoint split
 * into "eligible but not yet added" (structurally supports this
 * capability, no priority row yet) and "unavailable" (doesn't support this
 * capability at all — Part 23's "Unavailable endpoints" section). Never
 * invents participation — an endpoint appears in `chain` if and only if a
 * real `AuraRouteCapabilityPriority` row names it.
 */
export async function getCapabilityRoutingView(capability: AuraCapability): Promise<{
  chain: CapabilityChainEntry[];
  eligibleNotParticipating: AuraEndpointConfig[];
  unavailable: AuraEndpointConfig[];
}> {
  await ensureCapabilitySeedRun();
  const [priorityRows, allEndpoints] = await Promise.all([
    prisma.auraRouteCapabilityPriority.findMany({ where: { capability }, orderBy: { priority: "asc" } }),
    prisma.auraRouteEndpoint.findMany({ orderBy: { priority: "asc" } }),
  ]);

  const participatingIds = new Set(priorityRows.map((row) => row.endpointId));
  const endpointById = new Map(allEndpoints.map((row) => [row.id, row]));

  const chain: CapabilityChainEntry[] = priorityRows
    .map((row) => {
      const endpointRow = endpointById.get(row.endpointId);
      return endpointRow ? { endpoint: toEndpointConfig(endpointRow), priority: row.priority } : null;
    })
    .filter((entry): entry is CapabilityChainEntry => entry !== null);

  const eligibleNotParticipating = allEndpoints
    .filter((row) => !participatingIds.has(row.id) && row.capabilities.includes(capability))
    .map(toEndpointConfig);

  const unavailable = allEndpoints.filter((row) => !row.capabilities.includes(capability)).map(toEndpointConfig);

  return { chain, eligibleNotParticipating, unavailable };
}

export class CapabilityMismatchError extends Error {}

/**
 * Part 11's "Add/Remove endpoint from capability chain" — adds ONE
 * endpoint to ONE capability's routing chain, at the end (max priority +
 * 1), WITHOUT touching that endpoint's global `enabled` state or its
 * participation in any OTHER capability's chain. Server-side capability
 * validation is mandatory (Part 7/Part 29 #16/#17/#18) — rejects outright
 * if the endpoint's own declared `capabilities` doesn't include this one,
 * regardless of what a client requests.
 */
export async function addEndpointToCapability(endpointId: string, capability: AuraCapability): Promise<void> {
  const endpoint = await prisma.auraRouteEndpoint.findUnique({ where: { id: endpointId } });
  if (!endpoint) throw new InvalidEndpointError("No such endpoint.");
  if (!endpoint.capabilities.includes(capability)) {
    throw new CapabilityMismatchError(`${endpoint.displayName} does not support "${capability}" and cannot be added to that routing chain.`);
  }

  const existing = await prisma.auraRouteCapabilityPriority.findUnique({ where: { endpointId_capability: { endpointId, capability } } });
  if (existing) return; // already participating — idempotent, not an error.

  const maxPriority = await prisma.auraRouteCapabilityPriority.aggregate({ where: { capability }, _max: { priority: true } });
  await prisma.auraRouteCapabilityPriority.create({ data: { endpointId, capability, priority: (maxPriority._max.priority ?? 0) + 1 } });
}

/** Removes ONE endpoint from ONE capability's chain — never touches the endpoint's global `enabled` state or any other capability's chain. A no-op (not an error) if it wasn't participating. */
export async function removeEndpointFromCapability(endpointId: string, capability: AuraCapability): Promise<void> {
  await prisma.auraRouteCapabilityPriority.deleteMany({ where: { endpointId, capability } });
}

/**
 * Part 5/22 — one atomic rewrite of a SINGLE capability's chain order to
 * match the Operator's drag-and-drop result (index + 1). `orderedIds` must
 * name EXACTLY the endpoints currently participating in this capability —
 * a mismatch (stale client, concurrent add/remove) is rejected rather than
 * silently applied, same safety rule the endpoint-level reorder
 * already established.
 */
export async function reorderCapabilityChain(capability: AuraCapability, orderedIds: string[]): Promise<CapabilityChainEntry[] | null> {
  const current = await prisma.auraRouteCapabilityPriority.findMany({ where: { capability }, select: { endpointId: true } });
  const currentIds = new Set(current.map((row) => row.endpointId));
  if (orderedIds.length !== currentIds.size || orderedIds.some((id) => !currentIds.has(id))) {
    return null;
  }

  await prisma.$transaction(
    orderedIds.map((endpointId, index) =>
      prisma.auraRouteCapabilityPriority.update({ where: { endpointId_capability: { endpointId, capability } }, data: { priority: index + 1 } }),
    ),
  );
  return getCapabilityRoutingView(capability).then((view) => view.chain);
}

export async function getEndpoint(id: string): Promise<AuraEndpointConfig | undefined> {
  const row = await prisma.auraRouteEndpoint.findUnique({ where: { id } });
  return row ? toEndpointConfig(row) : undefined;
}

/** Server-only — checks whether the named env var is SET, never reads/returns/logs its value. */
export function isCredentialConfigured(envVar: string): boolean {
  return Boolean(process.env[envVar]);
}

export function isEndpointConfigured(endpoint: AuraEndpointConfig): boolean {
  return isCredentialConfigured(endpoint.apiKeyEnvVar);
}

export interface CreateEndpointInput {
  provider: ProviderId;
  credentialEnv: string;
  model: string;
  capabilities: AuraCapability[];
}

export class InvalidEndpointError extends Error {}
export class DuplicateEndpointError extends Error {}

/**
 * Part "Add Model" / "prevent duplicate" / "prevent unknown model" — the
 * ONE place a new routable endpoint is created. Validates against the
 * verified catalog (never accepts an arbitrary free-form model id — no
 * advanced/manual override exists this change, per the spec's own "prefer a
 * verified catalog" default), rejects a credential this provider doesn't
 * actually have, and lets Postgres's own `@@unique([provider, credentialEnv,
 * model])` catch a duplicate as the final authority (checked here first too,
 * for a clean error message rather than a raw constraint violation).
 */
export async function createEndpoint(input: CreateEndpointInput): Promise<AuraEndpointConfig> {
  const catalogEntry = getCatalogForProvider(input.provider);
  if (!catalogEntry || !catalogEntry.credentialEnvVars.includes(input.credentialEnv)) {
    throw new InvalidEndpointError(`"${input.credentialEnv}" is not a known credential for provider "${input.provider}".`);
  }
  const catalogModel = findCatalogModel(input.provider, input.model);
  if (!catalogModel || catalogModel.availability === "unavailable") {
    throw new InvalidEndpointError(`"${input.model}" is not a verified, currently available model for provider "${input.provider}".`);
  }
  const capabilities = input.capabilities.filter((capability) => catalogModel.capabilities.includes(capability));
  if (capabilities.length === 0) {
    throw new InvalidEndpointError(`None of the requested capabilities are supported by "${input.model}".`);
  }

  const existing = await prisma.auraRouteEndpoint.findUnique({
    where: { provider_credentialEnv_model: { provider: input.provider, credentialEnv: input.credentialEnv, model: input.model } },
  });
  if (existing) {
    throw new DuplicateEndpointError(`${catalogEntry.label} / ${input.credentialEnv} / ${catalogModel.displayName} is already a configured endpoint.`);
  }

  const maxPriority = await prisma.auraRouteEndpoint.aggregate({ _max: { priority: true } });
  const priority = (maxPriority._max.priority ?? 0) + 1;

  const row = await prisma.auraRouteEndpoint.create({
    data: {
      provider: input.provider,
      credentialEnv: input.credentialEnv,
      model: input.model,
      displayName: catalogModel.displayName,
      capabilities,
      enabled: true,
      priority,
    },
  });

  // A freshly added endpoint joins the END of every
  // capability chain it structurally supports by default (never inserted
  // ahead of an existing endpoint, never affecting any OTHER endpoint's
  // priority). This keeps "Add Model" immediately useful without a second,
  // mandatory per-capability step — the Operator can still remove it from
  // any specific chain afterward (Part 11's participation control), and
  // this never bypasses the capability-support check `addEndpointToCapability`
  // itself enforces.
  for (const capability of row.capabilities as AuraCapability[]) {
    await addEndpointToCapability(row.id, capability);
  }

  return toEndpointConfig(row);
}

export interface UpdateEndpointInput {
  enabled?: boolean;
  capabilities?: AuraCapability[];
}

export async function updateEndpoint(id: string, patch: UpdateEndpointInput): Promise<AuraEndpointConfig | undefined> {
  const existing = await prisma.auraRouteEndpoint.findUnique({ where: { id } });
  if (!existing) return undefined;
  const row = await prisma.auraRouteEndpoint.update({ where: { id }, data: patch });

  // Defense in depth: if this update narrowed `capabilities`, drop
  // any now-stale participation rows for a capability this endpoint no
  // longer declares — a chain must never reference an endpoint for a
  // capability it doesn't actually support, even transiently.
  if (patch.capabilities) {
    await prisma.auraRouteCapabilityPriority.deleteMany({
      where: { endpointId: id, capability: { notIn: patch.capabilities } },
    });
  }

  return toEndpointConfig(row);
}

export async function deleteEndpoint(id: string): Promise<boolean> {
  try {
    await prisma.auraRouteEndpoint.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Part "Drag and drop priority UI" / "persist" — one atomic rewrite of
 * every row's `priority` to match the Operator's new order (index + 1).
 * `orderedIds` must be exactly the current full set of endpoint ids — a
 * mismatch (a stale client, a concurrent add/delete) is rejected rather
 * than silently producing a partial or corrupted order (Part "Optimistic
 * Concurrency / Safety": "the final persisted configuration must remain
 * valid"). Deliberately no distributed locking beyond Postgres's own
 * transaction — the last reorder to commit wins, an acceptable, documented
 * simplicity for this MVP's single-Operator-at-a-time reality.
 */
export async function reorderEndpoints(orderedIds: string[]): Promise<AuraEndpointConfig[] | null> {
  const current = await prisma.auraRouteEndpoint.findMany({ select: { id: true } });
  const currentIds = new Set(current.map((row) => row.id));
  if (orderedIds.length !== currentIds.size || orderedIds.some((id) => !currentIds.has(id))) {
    return null;
  }

  await prisma.$transaction(orderedIds.map((id, index) => prisma.auraRouteEndpoint.update({ where: { id }, data: { priority: index + 1 } })));
  return listAllEndpoints();
}

/**
 * In-memory (this server process's lifetime only — see this file's own
 * top-of-file doc comment for why runtime health is deliberately NOT
 * persisted, unlike the routing configuration above). Updated only by an
 * ACTUAL request or an explicit Operator [Test] — never a background timer.
 */
interface RuntimeRecord {
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastFailureReason: ProviderFailureReason | null;
  latencyMsLastSample: number | null;
  successCount: number;
  failureCount: number;
  /** See `recordEndpointFailure`'s own doc comment. `null` when not currently in a cooldown window. */
  cooldownUntil: number | null;
}

const runtimeState = new Map<string, RuntimeRecord>();

function recordFor(endpointId: string): RuntimeRecord {
  const existing = runtimeState.get(endpointId);
  if (existing) return existing;
  const fresh: RuntimeRecord = {
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    latencyMsLastSample: null,
    successCount: 0,
    failureCount: 0,
    cooldownUntil: null,
  };
  runtimeState.set(endpointId, fresh);
  return fresh;
}

export function recordEndpointSuccess(endpointId: string, latencyMs: number): void {
  const record = recordFor(endpointId);
  record.lastSuccessAt = Date.now();
  record.latencyMsLastSample = latencyMs;
  record.successCount += 1;
  // A real success ends any cooldown immediately — never leave an endpoint
  // artificially skipped once it has demonstrably recovered.
  record.cooldownUntil = null;
}

/**
 * Endpoint cooldown behaviour — "when an endpoint receives a legitimate
 * rate-limit response, do NOT continuously hammer it; maintain a temporary
 * cooldown; use provider response information where available; do not
 * fabricate cooldown durations." Only `rate_limit`/`quota_exceeded` ever
 * start a cooldown — every other failure reason (timeout, auth,
 * configuration, context_limit,...) says nothing about WHEN retrying might
 * succeed, so it would be dishonest to attach a duration to it.
 * `retryAfterSeconds`, when the provider's own response actually included
 * one (Groq/OpenRouter's `Retry-After` header — see each provider file's
 * own `parseRetryAfterSeconds`), is used verbatim; `DEFAULT_COOLDOWN_MS`
 * below is used ONLY as a fallback when the provider didn't say, and is
 * documented as exactly that — a conservative default, never presented as
 * provider-supplied.
 */
const DEFAULT_COOLDOWN_MS: Partial<Record<ProviderFailureReason, number>> = {
  rate_limit: 15_000,
  quota_exceeded: 60_000,
};

export function recordEndpointFailure(endpointId: string, reason: ProviderFailureReason, retryAfterSeconds?: number | null): void {
  const record = recordFor(endpointId);
  record.lastFailureAt = Date.now();
  record.lastFailureReason = reason;
  record.failureCount += 1;

  const defaultCooldownMs = DEFAULT_COOLDOWN_MS[reason];
  if (defaultCooldownMs !== undefined) {
    const cooldownMs = retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : defaultCooldownMs;
    record.cooldownUntil = Date.now() + cooldownMs;
  }
}

/**
 * Part 18 — the router (`aura-router.ts`) checks this BEFORE attempting an
 * endpoint, so a rate-limited/quota-exhausted endpoint is skipped (never
 * re-attempted) for the remainder of its real cooldown window, instead of
 * being hit again on every single subsequent request. Returns `false` once
 * the window has naturally elapsed — no explicit "clear" step needed, and a
 * real success (`recordEndpointSuccess`) always clears it early regardless.
 */
export function isEndpointInCooldown(endpointId: string): boolean {
  const record = runtimeState.get(endpointId);
  return record?.cooldownUntil !== null && record?.cooldownUntil !== undefined && record.cooldownUntil > Date.now();
}

/**
 * Derives Part 20's exact required health vocabulary from the endpoint's
 * own config + its most recent real result — never a bare UI-only flag.
 * `disabled`/`misconfigured` are structural (don't need any request
 * history); everything else reflects whichever of "most recent success" vs
 * "most recent failure" is more recent, so a since-recovered endpoint
 * doesn't stay stuck showing an old failure forever.
 */
export function getEndpointHealth(endpoint: AuraEndpointConfig): AuraEndpointHealthStatus {
  if (!endpoint.enabled) return "disabled";
  if (!isEndpointConfigured(endpoint)) return "misconfigured";

  const record = runtimeState.get(endpoint.id);
  if (!record || (record.lastSuccessAt === null && record.lastFailureAt === null)) return "unknown";

  const lastSuccess = record.lastSuccessAt ?? -Infinity;
  const lastFailure = record.lastFailureAt ?? -Infinity;
  if (lastSuccess >= lastFailure) return "healthy";

  switch (record.lastFailureReason) {
    case "rate_limit":
    case "quota_exceeded":
      return "rate_limited";
    case "authentication_error":
    case "configuration_error":
      return "misconfigured";
    case "timeout":
    case "temporary_error":
    case "unavailable":
      return "degraded";
    default:
      return "unavailable";
  }
}

export function getEndpointRuntimeSnapshot(endpointId: string) {
  const record = runtimeState.get(endpointId);
  return {
    lastSuccessAt: record?.lastSuccessAt ?? null,
    lastFailureAt: record?.lastFailureAt ?? null,
    lastFailureReason: record?.lastFailureReason ?? null,
    latencyMsLastSample: record?.latencyMsLastSample ?? null,
    successCount: record?.successCount ?? 0,
    failureCount: record?.failureCount ?? 0,
  };
}

/**
 * Part "Non-Negotiable Architectural Rule" — builds the common
 * `AuraProviderAdapter` for one endpoint. ALL THREE providers now use their
 * respective key-parameterized `*WithApiKey`/`*WithGroqApiKey`/
 * `*WithOpenRouterApiKey` functions (`gemini-provider.ts`/`groq-
 * provider.ts`/`openrouter-provider.ts`), resolved from whichever
 * credential env var THIS endpoint names — never a shared singleton — so
 * any number of endpoints under the SAME provider can hold genuinely
 * independent credentials.
 *
 * FIXED a real bug this change: before this change,
 * Groq/OpenRouter endpoints were built from `getProvider(endpoint.provider)`
 * (the single legacy `AIProvider` singleton per provider), whose `chat()`/
 * `streamChat()` always read `process.env.GROQ_API_KEY`/
 * `process.env.OPENROUTER_API_KEY` internally — completely ignoring
 * `endpoint.apiKeyEnvVar`. A second configured Groq/OpenRouter credential
 * was therefore silently never used by ANY endpoint, no matter which one
 * the Operator configured it under. Gemini never had this bug (it already
 * used its own key-parameterized functions) — this brings Groq/OpenRouter
 * up to the same real independence Gemini already had.
 *
 * This is still the ONLY place that dispatches on `endpoint.provider` — an
 * adapter CONSTRUCTION detail, not a ROUTING decision (the fallback loop in
 * `aura-router.ts` never branches on provider).
 */
export function createAdapterForEndpoint(endpoint: AuraEndpointConfig): AuraProviderAdapter {
  function resolveKey(): string {
    const apiKey = process.env[endpoint.apiKeyEnvVar];
    if (!apiKey) {
      throw new ProviderTemporaryError(`${endpoint.displayName} isn't configured — ${endpoint.apiKeyEnvVar} isn't set.`, endpoint.provider, "configuration_error");
    }
    return apiKey;
  }

  const base: AuraProviderAdapter = (() => {
    if (endpoint.provider === "gemini") {
      return {
        endpointId: endpoint.id,
        async generate(request, signal) {
          return chatWithApiKey(resolveKey(), endpoint.model, request.temperature, request.messages, signal);
        },
        async stream(request, onDelta, signal) {
          return streamWithApiKey(resolveKey(), endpoint.model, request.temperature, request.messages, onDelta, signal);
        },
      };
    }
    if (endpoint.provider === "groq") {
      return {
        endpointId: endpoint.id,
        async generate(request, signal) {
          return chatWithGroqApiKey(resolveKey(), endpoint.model, request.temperature, request.messages, signal);
        },
        async stream(request, onDelta, signal) {
          let usage: ProviderUsage | null = null;
          for await (const delta of streamWithGroqApiKey(resolveKey(), endpoint.model, request.temperature, request.messages, signal, (reported) => {
            usage = reported;
          })) {
            onDelta(delta);
          }
          return { usage };
        },
      };
    }
    // endpoint.provider === "openrouter" — the model catalog/`createEndpoint`
    // validation above are the only source of new providers, and both are
    // constrained to "gemini" | "groq" | "openrouter" today (Part 21: one
    // adapter per provider, never a per-model branch).
    return {
      endpointId: endpoint.id,
      async generate(request, signal) {
        return chatWithOpenRouterApiKey(resolveKey(), endpoint.model, request.temperature, request.messages, signal);
      },
      async stream(request, onDelta, signal) {
        let usage: ProviderUsage | null = null;
        for await (const delta of streamWithOpenRouterApiKey(resolveKey(), endpoint.model, request.temperature, request.messages, signal, (reported) => {
          usage = reported;
        })) {
          onDelta(delta);
        }
        return { usage };
      },
    };
  })();

  // `transcribe`/`synthesizeSpeech` are
  // OPTIONAL on `AuraProviderAdapter` (see that interface's own doc
  // comment) — attached here ONLY when this specific endpoint's own
  // declared capabilities include the matching operation, so a plain text
  // endpoint's adapter object never even HAS a `transcribe` method to
  // accidentally call. `createEndpoint`'s catalog validation is what
  // actually guarantees only a real Whisper/TTS model can ever carry these
  // capabilities in the first place (Part 38 — never fabricated).
  const withTranscribe: AuraProviderAdapter = endpoint.capabilities.includes("speech_to_text")
    ? {
        ...base,
        // `language` forwarded straight through to the
        // real Groq call; see `AuraProviderAdapter.transcribe`'s own doc
        // comment for the live-verified reason this exists.
        async transcribe(audio, signal, language) {
          if (endpoint.provider !== "groq") {
            throw new ProviderTemporaryError(`${endpoint.displayName} does not implement speech-to-text.`, endpoint.provider, "unsupported_capability");
          }
          return transcribeWithGroqApiKey(resolveKey(), endpoint.model, audio, signal, language);
        },
      }
    : base;

  const withSpeech: AuraProviderAdapter = endpoint.capabilities.includes("text_to_speech")
    ? {
        ...withTranscribe,
        async synthesizeSpeech(text, signal) {
          if (endpoint.provider !== "gemini") {
            throw new ProviderTemporaryError(`${endpoint.displayName} does not implement text-to-speech.`, endpoint.provider, "unsupported_capability");
          }
          return synthesizeSpeechWithApiKey(resolveKey(), endpoint.model, text, signal);
        },
      }
    : withTranscribe;

  return withSpeech;
}
