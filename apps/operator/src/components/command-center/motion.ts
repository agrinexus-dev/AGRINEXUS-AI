import type { Variants } from "framer-motion";

import { tokens } from "@agrinexus/ui";

const seconds = (ms: number) => ms / 1000;

/** Page-load reveal sequence: Header → KPIs → Grid (Hero/Timeline/AURA/secondary widgets) → Dock. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: seconds(tokens.motionDuration.fast),
      delayChildren: seconds(tokens.motionDuration.fast),
    },
  },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: seconds(tokens.motionDuration.slow), ease: tokens.motionEasing.standard },
  },
};
