import type { Preview } from "@storybook/react-vite";

import "../src/styles/globals.css";

const preview: Preview = {
  parameters: {
    layout: "padded",
    backgrounds: {
      default: "agrinexus-dark",
      values: [{ name: "agrinexus-dark", value: "oklch(0.145 0.004 260)" }],
    },
  },
  initialGlobals: {
    backgrounds: { value: "agrinexus-dark" },
  },
  decorators: [
    (Story) => (
      <div className="dark min-h-full bg-background p-2 text-foreground">
        <Story />
      </div>
    ),
  ],
};

export default preview;
