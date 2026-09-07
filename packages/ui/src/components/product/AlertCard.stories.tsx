import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../foundation/Button";
import { AlertCard } from "./AlertCard";

const meta = {
  title: "Product/AlertCard",
  component: AlertCard,
  args: {
    severity: "critical",
    title: "Sensor offline — Field 7",
    description: "Soil moisture sensor SM-07 has not reported in 42 minutes.",
    timestamp: "2 min ago",
  },
} satisfies Meta<typeof AlertCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Critical: Story = {};
export const Attention: Story = { args: { severity: "attention", title: "Battery low — Drone AN-04" } };
export const WithAction: Story = {
  args: { action: <Button size="sm">Acknowledge</Button> },
};
