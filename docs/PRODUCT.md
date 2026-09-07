# Product

## Vision

AgriNexus AI is an operating system for the modern farm. It replaces the scattered
collection of spreadsheets, weather apps, sensor dashboards, and disconnected hardware
consoles with a single system where every plot, machine, sensor, finding, and decision
lives inside one operational picture — and where an intelligence layer (AURA) can reason
across all of it.

Where most agri‑tech tools are single‑purpose dashboards bolted onto a farm, AgriNexus AI
is designed as the layer the farm runs on: Mission Control is the desktop, and every
capability is a workspace within it.

## Who it is for

- **Farm Operators** — running daily operations: monitoring crops, dispatching drones and
  ground robots, watching sensors and weather, resolving alerts.
- **Farm Owners / Managers** — focused on outcomes: trends, comparisons, reports.
- **Farmers** — a simplified, mobile‑first surface for the essentials: farm state,
  attention items, and AURA, in English or Urdu.
- **Administrators** — user and access management.

## The two experiences

### Operator experience

The full operational environment, delivered as workspaces inside one shell:

| Workspace | What it does |
|---|---|
| **Command Center** (Mission Control) | The home screen: greeting, KPI row, mission status, a Digital Twin hero view, and a configurable widget grid (alerts, analytics, drone/robot fleet, sensor network, weather, energy, AURA summary, mission timeline). |
| **Digital Twin** | The full 3D farm scene with layer toggles, intelligence overlays, a details panel, mini‑map, and status bar. |
| **Drone Fleet** / **Ground Robots** | Fleet tables, KPIs, health, telemetry cards, add/edit/details, and a per‑vehicle missions view. |
| **Missions** / **Robot Missions** | A mission library, planner viewport, mission inspector, recurring‑missions panel, and an autonomous‑behavior toggle. |
| **Sensor Network** | Sensor overview, table, details, add sensor, quick actions. |
| **Sensor Analytics** | Historical dashboards, trend charts, thresholds, a reasoning‑engine intelligence panel, mission integration. |
| **Alerts** | The farm's active attention list, resolvable inline. |
| **Analytics** | Crop findings, findings history, mission activity history, plot analytics, robot‑resolution effectiveness. |
| **Reports** | Structured, shareable farm summaries. |
| **Weather** | Current conditions, forecast, agricultural analysis, and a farm‑location picker (Leaflet map). Real data via Open‑Meteo. |
| **Energy** | Power generation / consumption / equipment energy status. |
| **Settings** | Farm, AURA (provider/model/temperature), and the **AURA Router** panel (endpoint registry + per‑capability routing chains). |
| **Admin** | User profiles and access management. |

### Farmer experience

A deliberately small, role‑scoped surface inside the same application. Three pages —
**Farmer Dashboard**, **Farmer Digital Twin**, **Farmer AURA** — plus Settings. It uses a
soft, light, neumorphic visual language and is fully localized in **English and Urdu**
with right‑to‑left layout. Farmers can talk to AURA by text, voice, or by attaching a
photo of a crop issue. Detail: [`FARMER.md`](FARMER.md).

## Farm intelligence (AURA)

AURA is the reasoning layer, not a chat feature. It is grounded in the real state of the
farm on every request, keeps a strict boundary between *reasoning* and *acting*, routes
each request to an appropriate model with automatic fallback, and answers in the
farmer's language. Detail: [`AURA.md`](AURA.md).

## Digital Twin

A real‑time 3D representation of the farm — terrain, plots, roads, buildings,
environment, plus drones, robots, mission paths, crop‑finding markers, sensor markers,
and toggleable analytical overlays. It is the spatial home of the product. Detail:
[`DIGITAL-TWIN.md`](DIGITAL-TWIN.md).

## The conceptual farm model

The product is organized around one shared model of the farm. In the current
implementation the persisted entities are:

- **Farm** — the boundary everything else belongs to; also the unit of access control.
- **Plot** — a defined area of land (the spatial unit; used by the Digital Twin and by
  findings/missions). Read‑only at the API layer today.
- **Sensor** — a source of environmental readings, scoped to the farm.
- **Drone / Robot** — aerial and ground units. Identity and configuration are persisted;
  live position/battery/health are simulated.
- **DroneMission / RobotMission** — planned or executed units of work, with real foreign
  keys to a plot and a vehicle. Recurring schedules are configured separately.
- **CropFinding** — a detected crop issue (from a drone or robot inspection), with a type,
  severity, and resolution status.
- **Alert** — a condition that needs attention (an anomalous reading, an unresolved
  finding, and similar).
- **AURA conversations / messages** and the **AURA routing registry** (endpoints +
  per‑capability priority).

Analytics and reports are **derived** from the history of the above; they introduce no
new source data. Concepts from earlier design material — Fields (now Plots), Crops,
Irrigation as first‑class entities — are not separate models in the current schema. The
authoritative reference is [`DATA-MODEL.md`](DATA-MODEL.md).

## Operational workflows (current)

- **Morning review** — Command Center or Farmer Dashboard summarizes what changed, what
  needs attention, and AURA's read on farm state.
- **Investigate a finding** — from an alert or the Digital Twin, open the finding, ask
  AURA about it, and (if a robot can address it) propose a corrective mission.
- **Plan a mission** — from the mission library / planner, or by asking AURA; AURA
  proposes a structured plan and the operator confirms before it starts.
- **Watch a mission** — the Digital Twin and mission timeline show progress (simulated).
- **Recurring work** — configure a recurring drone or robot mission schedule.
- **Sensor analytics** — review trends, set thresholds, let the reasoning engine surface
  what a reading pattern implies.
- **Weather‑aware decisions** — the Weather workspace and AURA both factor current and
  forecast conditions.

## Design language

AgriNexus AI is presented as a precision instrument, not a decorated dashboard, drawing
on mission‑critical software and premium consumer hardware (Apple, Tesla, DJI FlightHub,
NASA Mission Control, Linear).

- **Color is functional.** The Operator interface is dark by default — a calm, neutral
  canvas so that data and state (nominal / attention / critical) draw the eye. Accent
  color is used sparingly enough that its appearance is meaningful. State is never
  communicated by color alone.
- **Typography carries hierarchy** through weight, size, and spacing; legibility at a
  glance takes precedence over style.
- **Layout follows a control‑surface logic** — grouped by operational relevance, with
  deliberate spacing, and one consistent structural language across every workspace.
- **Motion communicates state change**, not decoration: fast, purposeful transitions.
- **Two themes, one system.** The Farmer surface re‑values the same semantic design
  tokens under a `.farmer-theme` wrapper to produce a soft, approachable light palette —
  the shared `@agrinexus/ui` components render correctly in both without change.
- **Accessibility:** sufficient contrast at all times, generously sized touch targets,
  legible independent of pointer precision or screen size, RTL support for Urdu.

## Current capabilities vs. planned

**Implemented** — the workspace shell and all workspaces listed above; the Digital Twin;
AURA (grounded chat, routing, fallback, EN/UR, image analysis, voice STT/TTS);
drone/robot/sensor management and mission planning with simulated execution; findings,
alerts, recurring missions; real weather; analytics and reports; authentication and
role‑based access; the full Farmer experience.

**Planned / not implemented** — real hardware (ESP32 drones/robots/sensors), an MQTT or
similar transport, live telemetry synchronization into the Digital Twin, multi‑farm /
multi‑tenant workflows, and unattended autonomous action execution by AURA. The
architecture and schema are shaped to accommodate these without restructuring the layers
above.
