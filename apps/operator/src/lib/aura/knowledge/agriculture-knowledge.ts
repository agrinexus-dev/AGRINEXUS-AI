/**
 * AURA's internal agricultural knowledge base — general,
 * textbook-level reference definitions, not this farm's data. Used ONLY so
 * AURA can explain a concept ("What is NDVI?") correctly; never a source for
 * this farm's actual measurements — those always come from the live
 * application context assembled in `prompt-builder.ts`, never from here.
 */
export interface KnowledgeEntry {
  term: string;
  explanation: string;
}

export const AGRICULTURE_KNOWLEDGE_BASE: KnowledgeEntry[] = [
  {
    term: "Crop Health",
    explanation:
      "The overall physiological condition of a crop — vigor, color, canopy density, and stress signs. Typically assessed via visual inspection, multispectral imagery (e.g. NDVI), or ground sensors, and expressed as a status (healthy, moderate stress, attention, critical) or a score.",
  },
  {
    term: "Disease Risk",
    explanation:
      "An estimate of how likely a crop is to develop or be affected by disease, based on factors like humidity, leaf wetness, temperature, crop stage, and historical/visual disease markers. Usually expressed as a risk level (low/moderate/high) per field or zone.",
  },
  {
    term: "Irrigation",
    explanation:
      "The controlled application of water to crops to supplement rainfall. Decisions are driven by soil moisture readings, crop growth stage, weather forecast, and evapotranspiration — irrigating too little stresses the crop, too much wastes water and can promote disease/root issues.",
  },
  {
    term: "Soil Moisture",
    explanation:
      "The amount of water held in the soil, usually expressed as a percentage of the soil's water-holding capacity. Low soil moisture combined with active crop growth typically signals a need for irrigation; readings vary by depth and location within a field.",
  },
  {
    term: "Drone Missions",
    explanation:
      "Planned autonomous flights over a farm for tasks like field survey, crop scouting, or coverage mapping — defined by a route (waypoints), altitude, and sensor payload (RGB, thermal, multispectral). Mission progress is tracked against the planned route.",
  },
  {
    term: "Ground Robots",
    explanation:
      "Autonomous or semi-autonomous ground vehicles that perform field-level tasks such as weeding, scouting, or spraying, navigating a farm's road/field network and reporting status (task, position, battery) as they go.",
  },
  {
    term: "Yield",
    explanation:
      "The quantity of crop produced per unit area (e.g. tons/hectare or bushels/acre). Yield predictions combine historical yield, current crop health, weather, and growth-stage data to project the upcoming harvest relative to a baseline or prior season.",
  },
  {
    term: "NDVI",
    explanation:
      "Normalized Difference Vegetation Index — a widely used vegetation-health index computed from red and near-infrared reflectance: NDVI = (NIR − Red) / (NIR + Red). Healthy, dense vegetation reflects more near-infrared and less red light, giving a higher NDVI value; bare soil, water, or stressed/sparse vegetation gives a lower one.",
  },
  {
    term: "Thermal Imaging",
    explanation:
      "Imagery captured in the infrared spectrum showing surface temperature rather than visible color. In agriculture it's used to spot irrigation issues, crop water stress, and equipment/livestock heat signatures — warmer or cooler zones can indicate moisture stress, disease, or blockages before they're visible to the eye.",
  },
  {
    term: "RGB Imaging",
    explanation:
      "Standard visible-light (red/green/blue) photography, as opposed to thermal or multispectral imaging. Used for visual scouting, canopy assessment, weed identification, and general field documentation — it's what a normal camera captures.",
  },
  {
    term: "Precision Agriculture",
    explanation:
      "A farm-management approach that uses data (sensors, imagery, GPS, historical records) to make input decisions — irrigation, fertilizer, pesticide — at a fine spatial resolution (per zone or even per plant) rather than uniformly across a whole field, improving efficiency and reducing waste.",
  },
  {
    term: "Digital Twins",
    explanation:
      "A live, virtual 3D representation of a physical farm — its layout, fields, buildings, infrastructure, and autonomous units — kept in sync (in this platform, via simulated/mock state) with the real operation, so operators can inspect and reason about the farm without being physically present.",
  },
  {
    term: "Sensor Networks",
    explanation:
      "A distributed set of fixed field sensors (soil moisture, temperature, humidity, and similar) that report readings back for monitoring — giving continuous, per-location ground truth to complement periodic drone/satellite imagery.",
  },
  {
    term: "Weather",
    explanation:
      "Current and forecast atmospheric conditions (temperature, humidity, wind, precipitation) — a primary input to irrigation timing, spray-window selection, disease-risk modeling, and whether it's safe/effective to fly a drone mission.",
  },
  {
    term: "Farm Operations",
    explanation:
      "The day-to-day coordination of a farm's people, autonomous units, and infrastructure — scheduling missions, monitoring fleet readiness and alerts, and turning field/sensor data into concrete actions like irrigation, inspection, or harvest timing.",
  },
];

export function buildKnowledgeReferenceBlock(): string {
  return AGRICULTURE_KNOWLEDGE_BASE.map((entry) => `${entry.term}: ${entry.explanation}`).join("\n");
}
