import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloudSun } from "lucide-react";

import { WeatherCard } from "./WeatherCard";

const meta = {
  title: "Product/WeatherCard",
  component: WeatherCard,
  args: {
    condition: "Partly Cloudy",
    temperature: 24,
    icon: <CloudSun />,
    metrics: [
      { label: "Humidity", value: "58%" },
      { label: "Wind", value: "12 km/h" },
    ],
  },
} satisfies Meta<typeof WeatherCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoMetrics: Story = { args: { metrics: undefined } };
