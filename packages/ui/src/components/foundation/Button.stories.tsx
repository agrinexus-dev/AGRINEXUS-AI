import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./Button";

const meta = {
  title: "Foundation/Button",
  component: Button,
  args: {
    children: "Deploy Mission",
  },
  argTypes: {
    intent: { control: "select", options: ["primary", "secondary", "ghost", "outline", "destructive"] },
    size: { control: "select", options: ["sm", "md", "lg", "icon"] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { intent: "primary" } };
export const Secondary: Story = { args: { intent: "secondary" } };
export const Ghost: Story = { args: { intent: "ghost" } };
export const Outline: Story = { args: { intent: "outline" } };
export const Destructive: Story = { args: { intent: "destructive", children: "Abort Mission" } };
export const Loading: Story = { args: { loading: true } };
export const Disabled: Story = { args: { disabled: true } };

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};
