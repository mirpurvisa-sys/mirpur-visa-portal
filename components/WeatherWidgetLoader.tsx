"use client";

import dynamic from "next/dynamic";
import { WeatherWidgetSkeleton } from "./WidgetSkeletons";

const WeatherWidget = dynamic(() => import("./WeatherWidget"), {
  loading: () => <WeatherWidgetSkeleton />,
  ssr: false,
});

export function WeatherWidgetLoader() {
  return <WeatherWidget />;
}
