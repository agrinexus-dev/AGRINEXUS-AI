import type { Meta, StoryObj } from "@storybook/react-vite";
import { Settings } from "lucide-react";

import { IconButton } from "./IconButton";

const meta = {
  title: "Foundation/IconButton",
  component: IconButton,
  args: {
    icon: <Settings />,
    "aria-label": "Settings",
  },
  argTypes: {
    intent: { control: "select", options: ["primary", "secondary", "ghost"] },
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ghost: Story = { args: { intent: "ghost" } };
export const Primary: Story = { args: { intent: "primary" } };
export const Secondary: Story = { args: { intent: "secondary" } };
export const Disabled: Story = { args: { disabled: true } };
