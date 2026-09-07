import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../foundation/Button";
import { SectionHeader } from "./SectionHeader";

const meta = {
  title: "Product/SectionHeader",
  component: SectionHeader,
  args: {
    title: "Active Missions",
    description: "Missions currently in progress across all fields.",
  },
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithActions: Story = {
  args: { actions: <Button size="sm">New Mission</Button> },
};
