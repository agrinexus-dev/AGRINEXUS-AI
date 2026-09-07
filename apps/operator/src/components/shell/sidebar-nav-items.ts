import {
  AlertTriangle,
  BarChart3,
  Bot,
  Boxes,
  CloudSun,
  FileText,
  LayoutGrid,
  type LucideIcon,
  PlaneTakeoff,
  Radio,
  Settings,
  Zap,
} from "lucide-react";

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Present only for entries with a real route behind them; the rest stay selection-only until their workspace exists. */
  href?: string;
}

/**
 * Navigation entries. Every entry now has a real route — the
 * `href`-less "local selection state only" fallback in `app-shell.tsx`
 * still exists for any future nav item added without a workspace yet.
 */
export const sidebarNavItems: SidebarNavItem[] = [
  { id: "mission-control", label: "Mission Control", icon: LayoutGrid, href: "/" },
  { id: "digital-twin", label: "Digital Twin", icon: Boxes, href: "/digital-twin" },
  { id: "drone-fleet", label: "Drone Fleet", icon: PlaneTakeoff, href: "/drone-fleet" },
  { id: "ground-robots", label: "Ground Robots", icon: Bot, href: "/ground-robots" },
  { id: "sensor-network", label: "Sensor Network", icon: Radio, href: "/sensor-network" },
  { id: "weather", label: "Weather", icon: CloudSun, href: "/weather" },
  { id: "energy", label: "Energy", icon: Zap, href: "/energy" },
  { id: "analytics", label: "Analytics", icon: BarChart3, href: "/analytics" },
  { id: "alerts", label: "Alerts", icon: AlertTriangle, href: "/alerts" },
  { id: "reports", label: "Reports", icon: FileText, href: "/reports" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
];
