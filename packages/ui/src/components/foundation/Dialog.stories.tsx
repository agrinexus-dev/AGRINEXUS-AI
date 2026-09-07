import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./Dialog";

const meta = {
  title: "Foundation/Dialog",
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Abort Mission</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abort active mission?</DialogTitle>
          <DialogDescription>The drone will return to its home position immediately.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button intent="secondary">Cancel</Button>
          <Button intent="destructive">Abort</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
