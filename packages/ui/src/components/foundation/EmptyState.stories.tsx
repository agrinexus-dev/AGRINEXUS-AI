import type { Meta, StoryObj } from "@storybook/react-vite";
import { Satellite } from "lucide-react";

import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

const meta = {
  title: "Foundation/EmptyState",
  component: EmptyState,
  args: {
    icon: <Satellite />,
    title: "No active missions",
    description: "Missions planned by AURA or dispatched manually will appear here.",
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithAction: Story = {
  args: { action: <Button size="sm">Plan a Mission</Button> },
};
