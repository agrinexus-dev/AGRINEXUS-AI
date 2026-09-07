import type { Meta, StoryObj } from "@storybook/react-vite";

import { IconButton } from "./IconButton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./Tooltip";
import { Info } from "lucide-react";

const meta = {
  title: "Foundation/Tooltip",
  component: Tooltip,
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton icon={<Info />} aria-label="More information" />
        </TooltipTrigger>
        <TooltipContent>Soil moisture sensor, updated 4 minutes ago</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
