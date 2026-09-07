import type { Meta, StoryObj } from "@storybook/react-vite";

import { Panel } from "./Panel";
import { Typography } from "./Typography";

const meta = {
  title: "Foundation/Panel",
  component: Panel,
  argTypes: {
    variant: { control: "select", options: ["default", "elevated", "subtle", "glass"] },
    padding: { control: "select", options: ["none", "sm", "md", "lg"] },
  },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <Panel variant="default">
        <Typography variant="small">Default</Typography>
      </Panel>
      <Panel variant="elevated">
        <Typography variant="small">Elevated</Typography>
      </Panel>
      <Panel variant="subtle">
        <Typography variant="small">Subtle</Typography>
      </Panel>
      <Panel variant="glass">
        <Typography variant="small">Glass</Typography>
      </Panel>
    </div>
  ),
};
