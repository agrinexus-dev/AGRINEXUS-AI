"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

import { cn, tokens, WorkspaceHeader } from "@agrinexus/ui";

export interface ContentAreaProps {
  workspaceName: string;
  children: ReactNode;
  className?: string;
}

/**
 * Session-scoped only (module-level, cleared on a full reload) — keyed by
 * pathname so each page remembers its own scroll offset across a
 * client-side navigation away and back.
 */
const scrollPositions = new Map<string, number>();

const PAGE_TRANSITION = {
  duration: tokens.motionDuration.base / 1000,
  ease: tokens.motionEasing.standard,
};

/** The scrollable main region of a workspace. Renders whatever the current route provides, with a brief fade+slide as the route changes and its own scroll position remembered per page. */
export function ContentArea({ workspaceName, children, className }: ContentAreaProps) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = scrollPositions.get(pathname) ?? 0;
  }, [pathname]);

  function handleScroll() {
    const node = scrollRef.current;
    if (node) scrollPositions.set(pathname, node.scrollTop);
  }

  return (
    <main
      ref={scrollRef}
      onScroll={handleScroll}
      className={cn("flex-1 overflow-y-auto px-4 py-6 md:px-6 lg:px-8", className)}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <WorkspaceHeader title={workspaceName} />
        {/*
          A fresh `key` per pathname makes React treat this as a new element
          on every route change, so `initial` → `animate` replays each time —
          a plain fade+slide-in for the incoming page. Deliberately no `exit`/
          `AnimatePresence`: the old content is simply replaced in the same
          commit (no blank gap), which also sidesteps the double-layout jump
          a real overlapping exit+enter crossfade would need extra CSS to
          avoid for a full-page (non-list) swap like this.
        */}
        <motion.div key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={PAGE_TRANSITION}>
          {children}
        </motion.div>
      </div>
    </main>
  );
}
