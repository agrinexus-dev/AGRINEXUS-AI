import type { Meta, StoryObj } from "@storybook/react-vite";
import { Thermometer } from "lucide-react";

import { MetricTile } from "./MetricTile";

const meta = {
  title: "Product/MetricTile",
  component: MetricTile,
  args: {
    label: "Canopy Temp",
    value: 21.6,
    unit: "°C",
    icon: <Thermometer />,
    trend: "up",
  },
} satisfies Meta<typeof MetricTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Grid: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-3">
      <MetricTile label="Canopy Temp" value={21.6} unit="°C" trend="up" />
      <MetricTile label="Wind Speed" value={12} unit="km/h" trend="flat" />
      <MetricTile label="Battery" value={82} unit="%" trend="down" />
    </div>
  ),
};
