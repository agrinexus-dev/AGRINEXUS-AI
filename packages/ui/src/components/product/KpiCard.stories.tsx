import type { Meta, StoryObj } from "@storybook/react-vite";

import { KpiCard } from "./KpiCard";

const meta = {
  title: "Product/KpiCard",
  component: KpiCard,
  args: {
    label: "Projected Yield",
    value: "6.4 t/ha",
    delta: "+4.1%",
    deltaDirection: "up",
    period: "vs. last season",
  },
} satisfies Meta<typeof KpiCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Declining: Story = { args: { delta: "-2.3%", deltaDirection: "down" } };
export const WithSlot: Story = {
  args: {
    children: <div className="h-10 rounded-md bg-surface-elevated" aria-hidden />,
  },
};
