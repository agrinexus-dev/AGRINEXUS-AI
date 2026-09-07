import type { Meta, StoryObj } from "@storybook/react-vite";
import { Sparkles } from "lucide-react";

import { Button } from "../foundation/Button";
import { InsightCard } from "./InsightCard";

const meta = {
  title: "Product/InsightCard",
  component: InsightCard,
  args: {
    tag: "Prediction",
    title: "Irrigation window closing",
    body: "Soil moisture in Field 12 is trending toward the lower threshold. AURA recommends scheduling irrigation within 18 hours.",
    icon: <Sparkles />,
  },
} satisfies Meta<typeof InsightCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithAction: Story = {
  args: { action: <Button size="sm">Review Recommendation</Button> },
};
