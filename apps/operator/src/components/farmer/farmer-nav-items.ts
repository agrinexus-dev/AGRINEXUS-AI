import { Home, Settings, Sparkles, Sprout, type LucideIcon } from "lucide-react";

import type { FarmerTranslationKey } from "@/lib/farmer/i18n/use-farmer-translation";

export interface FarmerNavItem {
  id: string;
  /** English label — kept as a stable fallback/aria default; the rendered label always goes through `labelKey` + `useFarmerTranslation()` at the render site (`farmer-shell.tsx`). */
  label: string;
  /** The translation catalog key for this item's label. */
  labelKey: FarmerTranslationKey;
  icon: LucideIcon;
  href: string;
}

/**
 * Deliberately kept minimal — four items ("Farmer navigation should remain: Home,
 * Digital Twin, AURA, Settings") to give the new Settings foundation
 *  a real entry point — still a flat, simple tab strip, not the
 * "seven or more separate Farmer pages" the design warns against.
 */
export const farmerNavItems: FarmerNavItem[] = [
  { id: "home", label: "Home", labelKey: "nav.home", icon: Home, href: "/farmer" },
  { id: "digital-twin", label: "Digital Twin", labelKey: "nav.digitalTwin", icon: Sprout, href: "/farmer/digital-twin" },
  { id: "aura", label: "AURA", labelKey: "nav.aura", icon: Sparkles, href: "/farmer/aura" },
  { id: "settings", label: "Settings", labelKey: "nav.settings", icon: Settings, href: "/farmer/settings" },
];
