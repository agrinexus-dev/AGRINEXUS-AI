# Farmer experience

Farmer is a **role‑based experience inside `apps/operator`**, not a separate application.
There is no `apps/farmer`. A user whose authorized `roles` include `farmer` lands in the
Farmer shell; the middleware gates `/farmer/**` to that role (a multi‑role account can
have both Farmer and Operator access).

Source: `apps/operator/src/app/farmer/**`, `apps/operator/src/components/farmer/**`,
`apps/operator/src/lib/farmer/**`.

## Navigation

A deliberately small, flat tab strip — four destinations:

| Route | Page |
|---|---|
| `/farmer` | **Farmer Dashboard** |
| `/farmer/digital-twin` | **Farmer Digital Twin** |
| `/farmer/aura` | **Farmer AURA** |
| `/farmer/settings` | **Farmer Settings** |

## Farmer Dashboard (`/farmer`)

The Dashboard answers "what is the state of my farm, and what needs my attention?"

- **Farm State hero** — a single dominant classification of overall farm state, computed
  from real data (`lib/farmer/farm-state.ts`) — a plain‑TypeScript classification module
  (no React) so a Server Component can call it directly during render.
- **KPI row** — the key farm numbers.
- **Attention & actions** — real, unresolved items (alerts, findings) with a real
  severity treatment, each linking to where it can be addressed. "Ask AURA about this" is
  available on a finding.
- **Fleet availability** — drone and robot availability, read live from the fleet stores.
- **Recent operations** — completed missions only (never active ones).

The Dashboard is primarily a Server Component; interactive pieces are thin client
components on top.

## Farmer Digital Twin (`/farmer/digital-twin`)

The same 3D Digital Twin scene as the Operator's, rendered inside the Farmer shell with
the Farmer theme and localization. See [`DIGITAL-TWIN.md`](DIGITAL-TWIN.md).

## Farmer AURA (`/farmer/aura`)

A full‑page presentation of AURA, built from the **same** pieces the Operator's floating
AURA panel uses (`useAuraChatStore`, `useCollectAuraContext`, `MessageList`, `ChatInput`)
— one conversation / provider / context pipeline, not a second chat implementation. A
history drawer (`aura/aura-history-panel.tsx`) lists the farmer's own database‑backed
conversations.

Input methods:

- **Text** — the composer detects English vs. Urdu automatically, per turn.
- **Voice** — a push‑to‑talk microphone button; audio is transcribed (Whisper) and the
  reply can be spoken back (Gemini TTS).
- **Image** — attach a photo of a crop issue. A predefined image‑analysis prompt is used;
  the farmer picks the answer language (English / اردو) for that turn.

"Ask AURA about this" from the Farmer Digital Twin's details panel navigates here with the
selected finding as context.

Detail on AURA's behavior, routing, and safety: [`AURA.md`](AURA.md).

## Farmer Settings (`/farmer/settings`)

Farmer‑appropriate configuration, including the **App Language** control (English / Urdu).
There is a single language setting — the previous separate "AURA reply language" control
was removed; AURA now detects the language of each message automatically.

## Localization (English / Urdu)

- A dedicated translation catalog: `lib/farmer/i18n/en.ts` and `ur.ts`. `ur.ts` is typed
  `Record<keyof typeof FARMER_TEXT_EN, string>`, so a missing or mistyped key is a
  compile error, not a silent English fallback.
- The Urdu text is plain, everyday Urdu appropriate for a farmer — not literary Urdu, not
  a word‑for‑word machine translation. Brand and product names ("AgriNexus", "AURA")
  stay in Latin script.
- **Right‑to‑left layout:** the Farmer shell toggles `dir="rtl"` / `"ltr"` on its own root
  element, scoped entirely to `.farmer-theme`. Physical‑direction CSS in shared
  components was converted to logical properties (a no‑op for the Operator). A directional
  arrow icon in the Dashboard flips under RTL.
- The language preference is `displayLanguage`, persisted client‑side.

## Visual language

The Farmer surface uses a soft, light, neumorphic palette. It is **not a second design
system**: `farmer-theme.css` re‑values the same semantic design tokens that every shared
`@agrinexus/ui` component already consumes (`--background`, `--surface`, `--radius`, shadow
tokens, …) inside a `.farmer-theme` wrapper. Components render with the warm light palette
anywhere under that wrapper with zero component changes, while every Operator/Admin screen
outside it keeps the dark "instrument panel" theme. A dark variant of the Farmer theme
also exists.
