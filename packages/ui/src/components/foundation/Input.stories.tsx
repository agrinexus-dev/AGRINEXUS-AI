import type { Meta, StoryObj } from "@storybook/react-vite";
import { Search } from "lucide-react";

import { Input } from "./Input";

const meta = {
  title: "Foundation/Input",
  component: Input,
  args: { placeholder: "Search fields, missions, alerts…" },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithLeadingIcon: Story = { args: { leadingIcon: <Search /> } };
export const Disabled: Story = { args: { disabled: true, value: "Locked field" } };
