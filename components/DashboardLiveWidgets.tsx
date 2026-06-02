import { CurrencyWidgetLoader } from "./CurrencyWidgetLoader";
import { WeatherWidgetLoader } from "./WeatherWidgetLoader";
import { CurrencyWidgetSkeleton, WeatherWidgetSkeleton } from "./WidgetSkeletons";

export function DashboardLiveWidgets() {
  return (
    <aside className="dashboardAside">
      <WeatherWidgetLoader />
      <CurrencyWidgetLoader />
    </aside>
  );
}

export function DashboardLiveWidgetsSkeleton() {
  return (
    <aside className="dashboardAside" aria-label="Loading dashboard widgets">
      <WeatherWidgetSkeleton />
      <CurrencyWidgetSkeleton />
    </aside>
  );
}
