import type { Meta, StoryObj } from "@storybook/react-vite";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./Card";
import { Button } from "./Button";

const meta = {
  title: "Foundation/Card",
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Field 12 — North Ridge</CardTitle>
        <CardDescription>18.4 ha · Winter Wheat</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-foreground-muted">Soil moisture and canopy health nominal for the last 72 hours.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm" intent="secondary">
          View Field
        </Button>
      </CardFooter>
    </Card>
  ),
};
