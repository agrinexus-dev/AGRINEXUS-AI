import type { Meta, StoryObj } from "@storybook/react-vite";

import { StatusBadge } from "./StatusBadge";

const meta = {
  title: "Foundation/StatusBadge",
  component: StatusBadge,
  args: {
    status: "nominal",
  },
  argTypes: {
    status: { control: "select", options: ["nominal", "attention", "critical", "offline", "info"] },
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="nominal" />
      <StatusBadge status="attention" />
      <StatusBadge status="critical" />
      <StatusBadge status="offline" />
      <StatusBadge status="info" />
    </div>
  ),
};

export const CustomLabel: Story = { args: { status: "nominal", label: "All Systems Nominal" } };
