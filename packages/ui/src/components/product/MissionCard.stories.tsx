import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plane } from "lucide-react";

import { Button } from "../foundation/Button";
import { MissionCard } from "./MissionCard";

const meta = {
  title: "Product/MissionCard",
  component: MissionCard,
  args: {
    title: "Perimeter Survey — Field 12",
    assetType: "drone",
    status: "nominal",
    field: "North Ridge",
    eta: "6 min",
    progress: 62,
    icon: <Plane />,
  },
} satisfies Meta<typeof MissionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = { args: {}, render: (args) => <MissionCard {...args} /> };

export const WithActions: Story = {
  args: {
    actions: (
      <>
        <Button size="sm" intent="secondary">
          View
        </Button>
        <Button size="sm" intent="destructive">
          Abort
        </Button>
      </>
    ),
  },
};

export const Attention: Story = { args: { status: "attention", progress: 34 } };
export const RobotMission: Story = { args: { assetType: "robot", status: "critical", progress: undefined } };
