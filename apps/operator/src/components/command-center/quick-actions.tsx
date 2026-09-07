"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Boxes, FileText, PresentationIcon, Rocket } from "lucide-react";

import { Button } from "@agrinexus/ui";

import { useWorkspace } from "@/lib/workspace/workspace-context";

import { fadeUp } from "./motion";

/**
 * "Launch Mission" was a real `<Button>` with no
 * `onClick` at all (genuinely inert, not just visually broken). The
 * existing app architecture already has one clear place a mission gets
 * launched from — the Mission Planner (`/drone-fleet/missions`, the same
 * "New Mission" → assign → generate path → start flow "Open Digital Twin"
 * next to it already models the pattern for: a plain `router.push`, no
 * separate workspace/dialog system). Wired the same way, so clicking it
 * now genuinely opens that real create-a-mission workflow. Generate Report
 * is unchanged/still inert — it wasn't reported broken this change, and
 * "Reports" already exists as its own full page (`/reports`) reachable
 * from the sidebar, so wiring it up isn't a same-pattern fix the way
 * Launch Mission was.
 */
export function QuickActions() {
  const router = useRouter();
  const { presentationMode, togglePresentationMode } = useWorkspace();

  return (
    <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2">
      <Button intent="secondary" leadingIcon={<Rocket className="size-4" />} onClick={() => router.push("/drone-fleet/missions")}>
        Launch Mission
      </Button>
      <Button
        intent="secondary"
        leadingIcon={<Boxes className="size-4" />}
        onClick={() => router.push("/digital-twin")}
      >
        Open Digital Twin
      </Button>
      <Button intent="secondary" leadingIcon={<FileText className="size-4" />}>
        Generate Report
      </Button>
      <Button
        intent={presentationMode ? "primary" : "secondary"}
        leadingIcon={<PresentationIcon className="size-4" />}
        aria-pressed={presentationMode}
        onClick={togglePresentationMode}
      >
        Presentation Mode
      </Button>
    </motion.div>
  );
}
