import type { Meta, StoryObj } from "@storybook/react-vite";

import { Typography } from "./Typography";

const meta = {
  title: "Foundation/Typography",
  component: Typography,
  args: {
    children: "AgriNexus AI",
  },
} satisfies Meta<typeof Typography>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Typography variant="display">Display</Typography>
      <Typography variant="h1">Heading 1</Typography>
      <Typography variant="h2">Heading 2</Typography>
      <Typography variant="h3">Heading 3</Typography>
      <Typography variant="h4">Heading 4</Typography>
      <Typography variant="body">Body text</Typography>
      <Typography variant="bodyMuted">Body muted text</Typography>
      <Typography variant="small">Small text</Typography>
      <Typography variant="caption">Caption text</Typography>
      <Typography variant="mono">Mono / telemetry 42.190 ha</Typography>
    </div>
  ),
};

export const Display: Story = { args: { variant: "display" } };
export const Body: Story = { args: { variant: "body" } };
