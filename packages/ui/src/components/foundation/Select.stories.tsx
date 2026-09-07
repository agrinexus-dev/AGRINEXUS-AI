import type { Meta, StoryObj } from "@storybook/react-vite";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";

const meta = {
  title: "Foundation/Select",
  component: Select,
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Select defaultValue="drone">
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Select asset type" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="drone">Drone</SelectItem>
        <SelectItem value="robot">Ground Robot</SelectItem>
        <SelectItem value="sensor">Sensor</SelectItem>
      </SelectContent>
    </Select>
  ),
};
