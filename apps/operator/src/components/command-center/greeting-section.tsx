"use client";

import { motion } from "framer-motion";
import { useSession } from "next-auth/react";

import { Typography } from "@agrinexus/ui";

import type { AppSessionUser } from "@/lib/auth/types";

import { getTimeOfDayGreeting } from "./lib/greeting";
import { fadeUp } from "./motion";

/**
 * `as="h2"` deliberately — the shell's own WorkspaceHeader already renders
 * the page's single h1 ("Mission Control") above this content.
 */
export function GreetingSection() {
  const { data: session } = useSession();
  const user = session?.user as AppSessionUser | undefined;
  const firstName = user?.name?.split(" ")[0] ?? "Operator";

  return (
    <motion.div variants={fadeUp} className="flex flex-col gap-1">
      <Typography variant="caption" className="text-accent">
        AgriNexus Command Center
      </Typography>
      <Typography variant="display" as="h2">
        {/* A server/client timezone hydration-mismatch fix — `getTimeOfDayGreeting()`
            reads the LOCAL clock, which differs between the server (renders in
            whatever timezone the Node process runs in) and the client (the
            visitor's own timezone), so the text can legitimately differ between
            SSR and hydration and was throwing React's hydration-mismatch error
            (#418) on every load. `suppressHydrationWarning` is the standard,
            minimal fix for genuinely time-dependent text: React uses the
            server-rendered value for the very first paint, then quietly adopts
            whatever the client computes — no visible flash, no console error. */}
        <span suppressHydrationWarning>{getTimeOfDayGreeting()}</span>, {firstName}.
      </Typography>
      <Typography variant="small">Here is what is happening across your farm right now.</Typography>
    </motion.div>
  );
}
