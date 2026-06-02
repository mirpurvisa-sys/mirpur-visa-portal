export function WeatherWidgetSkeleton() {
  return (
    <section className="weatherCard widgetSkeletonCard">
      <div>
        <span className="skeletonLine wide" />
        <span className="skeletonLine" />
      </div>
      <div className="weatherStats">
        <span className="skeletonBox" />
        <span className="skeletonBox" />
        <span className="skeletonBox" />
      </div>
      <span className="skeletonLine centered" />
    </section>
  );
}

export function CurrencyWidgetSkeleton() {
  return (
    <section className="portalCard currencyCard widgetSkeletonCard">
      <h2>Currency Rates</h2>
      <div className="currencyGrid">
        <span className="skeletonInput" />
        <span className="skeletonInput" />
        <span className="skeletonInput" />
        <span className="skeletonInput" />
      </div>
      <span className="skeletonLine" />
    </section>
  );
}
