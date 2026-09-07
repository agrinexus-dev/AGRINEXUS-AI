"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { BarChart3, Boxes, CloudSun, PlaneTakeoff, Sparkles, Zap } from "lucide-react";

import { IconButton, tokens, Tooltip, TooltipContent, TooltipTrigger } from "@agrinexus/ui";

import { fadeUp } from "./motion";

const dockItems = [
  { label: "Digital Twin", icon: Boxes, href: "/digital-twin" },
  { label: "AURA", icon: Sparkles, href: undefined },
  { label: "Drone Fleet", icon: PlaneTakeoff, href: "/drone-fleet" },
  { label: "Weather", icon: CloudSun, href: "/weather" },
  { label: "Energy", icon: Zap, href: "/energy" },
  { label: "Analytics", icon: BarChart3, href: "/analytics" },
] as const;

/**
 * Pinned-workspace quick-launch dock. Fixed to the viewport (a sibling of
 * the page's main stagger tree, hence its own explicit initial/animate).
 * Every item now has a real route behind it except AURA,
 * which opens the chat panel rather than navigating anywhere.
 */
export function FloatingDock() {
  const router = useRouter();

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      transition={{
        delay: 0.55,
        duration: tokens.motionDuration.slow / 1000,
        ease: tokens.motionEasing.standard,
      }}
      className="fixed right-6 bottom-6 z-(--z-sticky) flex items-center gap-1 rounded-full border border-border bg-surface-elevated/90 p-1.5 shadow-elevated backdrop-blur-xl"
    >
      {dockItems.map(({ label, icon: Icon, href }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <IconButton
              aria-label={label}
              icon={<Icon />}
              intent="ghost"
              size="md"
              onClick={href ? () => router.push(href) : undefined}
            />
          </TooltipTrigger>
          <TooltipContent side="top">{label}</TooltipContent>
        </Tooltip>
      ))}
    </motion.div>
  );
}
