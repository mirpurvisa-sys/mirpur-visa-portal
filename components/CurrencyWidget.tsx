"use client";

import { memo, useEffect, useMemo, useState } from "react";

const CURRENCIES = [
  { code: "CAD", label: "Canada Dollars" },
  { code: "PKR", label: "Pakistan Rupees" },
  { code: "USD", label: "US Dollars" },
  { code: "GBP", label: "British Pounds" },
  { code: "EUR", label: "Euros" },
  { code: "AUD", label: "Australian Dollars" },
  { code: "AED", label: "UAE Dirhams" },
  { code: "SAR", label: "Saudi Riyals" },
];

function CurrencyWidget() {
  const [from, setFrom] = useState("CAD");
  const [to, setTo] = useState("PKR");
  const [amount, setAmount] = useState("1");
  const [rate, setRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateTime, setRateTime] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRateError(null);
      try {
        const response = await fetch(`/api/live/currency?from=${from}&to=${to}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Currency service is unavailable.");
        const payload = await response.json();
        const nextRate = numberOrNull(payload?.rate);
        if (nextRate === null) throw new Error(`No ${from} to ${to} rate was returned.`);
        if (!cancelled) {
          setRate(nextRate);
          setRateTime(typeof payload.time === "string" ? payload.time : null);
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setRate(null);
          setRateError(error instanceof Error ? error.message : "Currency rate could not be loaded.");
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [from, to]);

  const converted = useMemo(() => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || rate === null) return "";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(parsed * rate);
  }, [amount, rate]);

  return (
    <section className="portalCard currencyCard">
      <h2>Currency Rates</h2>
      <div className="currencyGrid">
        <label><span>From</span><select className="input" value={from} onChange={(event) => setFrom(event.target.value)}>{CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        <label><span>To</span><select className="input" value={to} onChange={(event) => setTo(event.target.value)}>{CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        <label><span>Amount</span><input className="input" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></label>
        <label><span>Converted Amount</span><input className="input" value={rateError || converted || "Loading..."} readOnly /></label>
      </div>
      <p className="widgetMeta">{rateTime ? `Updated ${rateTime}` : "Rates are cached server-side and refreshed in the background."}</p>
    </section>
  );
}

function numberOrNull(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

export default memo(CurrencyWidget);
