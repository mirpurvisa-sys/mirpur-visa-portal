"use client";

import { useEffect, useMemo, useState } from "react";

type WeatherState = {
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  code: number | null;
  time: string | null;
  error: string | null;
  loading: boolean;
};

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

export function DashboardLiveWidgets() {
  const [weather, setWeather] = useState<WeatherState>({ temperature: null, humidity: null, pressure: null, code: null, time: null, error: null, loading: true });
  const [from, setFrom] = useState("CAD");
  const [to, setTo] = useState("PKR");
  const [amount, setAmount] = useState("1");
  const [rate, setRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateTime, setRateTime] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadWeather() {
      try {
        const url = "https://api.open-meteo.com/v1/forecast?latitude=33.148&longitude=73.751&current=temperature_2m,relative_humidity_2m,pressure_msl,weather_code&timezone=Asia%2FKarachi";
        const response = await fetch(url);
        if (!response.ok) throw new Error("Weather service is unavailable.");
        const payload = await response.json();
        const current = payload.current || {};
        if (!cancelled) {
          setWeather({
            temperature: numberOrNull(current.temperature_2m),
            humidity: numberOrNull(current.relative_humidity_2m),
            pressure: numberOrNull(current.pressure_msl),
            code: numberOrNull(current.weather_code),
            time: typeof current.time === "string" ? current.time : null,
            error: null,
            loading: false,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setWeather((current) => ({ ...current, error: error instanceof Error ? error.message : "Weather could not be loaded.", loading: false }));
        }
      }
    }
    loadWeather();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadRate() {
      setRateError(null);
      try {
        const response = await fetch(`https://open.er-api.com/v6/latest/${from}`);
        if (!response.ok) throw new Error("Currency service is unavailable.");
        const payload = await response.json();
        const nextRate = numberOrNull(payload?.rates?.[to]);
        if (nextRate === null) throw new Error(`No ${from} to ${to} rate was returned.`);
        if (!cancelled) {
          setRate(nextRate);
          setRateTime(typeof payload.time_last_update_utc === "string" ? payload.time_last_update_utc : null);
        }
      } catch (error) {
        if (!cancelled) {
          setRate(null);
          setRateError(error instanceof Error ? error.message : "Currency rate could not be loaded.");
        }
      }
    }
    loadRate();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const converted = useMemo(() => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || rate === null) return "";
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(parsed * rate);
  }, [amount, rate]);

  return <aside className="dashboardAside">
    <section className="weatherCard">
      <div>
        <h2>Mirpur, PK</h2>
        <span>{weather.time ? formatWeatherTime(weather.time) : weather.loading ? "Loading live weather..." : "Live weather unavailable"}</span>
      </div>
      <div className="weatherStats">
        <strong>{weather.temperature === null ? "--" : weather.temperature.toFixed(1)}<sup>&deg;</sup></strong>
        <b>{weather.pressure === null ? "--" : Math.round(weather.pressure)}<br /><small>Pressure</small></b>
        <b>{weather.humidity === null ? "--" : Math.round(weather.humidity)}<br /><small>Humidity</small></b>
      </div>
      <p>{weather.error || weatherCodeLabel(weather.code)}</p>
    </section>

    <section className="portalCard currencyCard">
      <h2>Currency Rates</h2>
      <div className="currencyGrid">
        <label><span>From</span><select className="input" value={from} onChange={(event) => setFrom(event.target.value)}>{CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        <label><span>To</span><select className="input" value={to} onChange={(event) => setTo(event.target.value)}>{CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        <label><span>Amount</span><input className="input" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></label>
        <label><span>Converted Amount</span><input className="input" value={rateError || converted || "Loading..."} readOnly /></label>
      </div>
      <p className="widgetMeta">{rateTime ? `Updated ${rateTime}` : "Rates via ExchangeRate-API open access endpoint."}</p>
    </section>
  </aside>;
}

function numberOrNull(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function formatWeatherTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-PK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function weatherCodeLabel(code: number | null) {
  const labels: Record<number, string> = {
    0: "Clear Sky",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing Rime Fog",
    51: "Light Drizzle",
    53: "Drizzle",
    55: "Dense Drizzle",
    61: "Slight Rain",
    63: "Rain",
    65: "Heavy Rain",
    71: "Slight Snow",
    73: "Snow",
    75: "Heavy Snow",
    80: "Rain Showers",
    81: "Rain Showers",
    82: "Violent Showers",
    95: "Thunderstorm",
    96: "Thunderstorm With Hail",
    99: "Thunderstorm With Hail",
  };
  return code === null ? "Weather Loading" : labels[code] || "Current Conditions";
}
