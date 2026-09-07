import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plane } from "lucide-react";

import { Button } from "../foundation/Button";
import { WorkspaceHeader } from "./WorkspaceHeader";

const meta = {
  title: "Product/WorkspaceHeader",
  component: WorkspaceHeader,
  args: {
    title: "Drone Operations",
    subtitle: "4 drones active · 2 missions in progress",
    icon: <Plane />,
  },
} satisfies Meta<typeof WorkspaceHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithActions: Story = {
  args: { actions: <Button size="sm">Plan Mission</Button> },
};
