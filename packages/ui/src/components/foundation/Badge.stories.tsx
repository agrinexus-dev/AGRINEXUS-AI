import type { Meta, StoryObj } from "@storybook/react-vite";

import { Badge } from "./Badge";

const meta = {
  title: "Foundation/Badge",
  component: Badge,
  args: { children: "Badge" },
  argTypes: {
    intent: { control: "select", options: ["neutral", "accent", "success", "warning", "critical", "outline"] },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllIntents: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge intent="neutral">Neutral</Badge>
      <Badge intent="accent">Accent</Badge>
      <Badge intent="success">Success</Badge>
      <Badge intent="warning">Warning</Badge>
      <Badge intent="critical">Critical</Badge>
      <Badge intent="outline">Outline</Badge>
    </div>
  ),
};
