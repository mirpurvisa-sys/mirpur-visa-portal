"use client";

import dynamic from "next/dynamic";
import { CurrencyWidgetSkeleton } from "./WidgetSkeletons";

const CurrencyWidget = dynamic(() => import("./CurrencyWidget"), {
  loading: () => <CurrencyWidgetSkeleton />,
  ssr: false,
});

export function CurrencyWidgetLoader() {
  return <CurrencyWidget />;
}
