"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { PresentationIcon, RotateCcw, Save, Sparkles } from "lucide-react";

import { Button, Switch, Tooltip, TooltipContent, TooltipTrigger, Typography } from "@agrinexus/ui";

import { savePersistedLayout } from "@/lib/workspace/persistence";
import { useWorkspace } from "@/lib/workspace/workspace-context";

import { fadeUp } from "./motion";

/**
 * A Command-Center-scoped toolbar, distinct from the Adaptive Workspace
 * Engine's own generic `WorkspaceToolbar` (which already covers Reset
 * Layout + Presentation Mode for the bare engine). This one adds Save
 * Layout and a genuinely inert Demo Mode placeholder, reusing the engine's
 * existing context actions and persistence function rather than
 * reimplementing them.
 */
export function CommandCenterToolbar() {
  const { order, widgets, presentationMode, togglePresentationMode, resetLayout } = useWorkspace();
  const [justSaved, setJustSaved] = useState(false);

  function handleSave() {
    savePersistedLayout({ version: 1, order, widgets });
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1600);
  }

  return (
    <motion.div
      variants={fadeUp}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2.5"
    >
      <div className="flex items-center gap-2">
        <label htmlFor="command-center-presentation-mode" className="flex cursor-pointer items-center gap-2 select-none">
          <PresentationIcon className="size-4 text-foreground-muted" aria-hidden="true" />
          <Typography variant="small">Presentation Mode</Typography>
        </label>
        <Switch id="command-center-presentation-mode" checked={presentationMode} onCheckedChange={togglePresentationMode} />
      </div>

      {!presentationMode && (
        <div className="flex flex-wrap items-center gap-2">
          <Button intent="ghost" size="sm" leadingIcon={<Save className="size-3.5" />} onClick={handleSave}>
            {justSaved ? "Saved" : "Save Layout"}
          </Button>
          <Button intent="ghost" size="sm" leadingIcon={<RotateCcw className="size-3.5" />} onClick={resetLayout}>
            Reset Layout
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button intent="ghost" size="sm" leadingIcon={<Sparkles className="size-3.5" />} disabled>
                  Demo Mode
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Coming soon</TooltipContent>
          </Tooltip>
        </div>
      )}
    </motion.div>
  );
}
