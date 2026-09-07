import type { Meta, StoryObj } from "@storybook/react-vite";
import { Droplets } from "lucide-react";

import { TelemetryCard } from "./TelemetryCard";

const meta = {
  title: "Product/TelemetryCard",
  component: TelemetryCard,
  args: {
    label: "Soil Moisture",
    value: 42.3,
    unit: "%",
    icon: <Droplets />,
    trend: "up",
    trendLabel: "+1.2%",
  },
} satisfies Meta<typeof TelemetryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Declining: Story = { args: { trend: "down", trendLabel: "-0.8%" } };
export const Flat: Story = { args: { trend: "flat", trendLabel: "steady" } };
