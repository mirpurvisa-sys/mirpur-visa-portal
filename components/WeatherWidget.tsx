"use client";

import { memo, useEffect, useState } from "react";

type WeatherSnapshot = {
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  code: number | null;
  time: string | null;
  error?: string | null;
};

function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherSnapshot>({
    temperature: null,
    humidity: null,
    pressure: null,
    code: null,
    time: null,
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/live/weather", {
          credentials: "same-origin",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Weather service is unavailable.");
        if (!cancelled) {
          setWeather({
            temperature: numberOrNull(payload.temperature),
            humidity: numberOrNull(payload.humidity),
            pressure: numberOrNull(payload.pressure),
            code: numberOrNull(payload.code),
            time: typeof payload.time === "string" ? payload.time : null,
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setWeather((current) => ({
            ...current,
            error: error instanceof Error ? error.message : "Weather could not be loaded.",
          }));
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return (
    <section className="weatherCard">
      <div>
        <h2>Mirpur, PK</h2>
        <span>{weather.time ? formatWeatherTime(weather.time) : "Weather refreshes after load"}</span>
      </div>
      <div className="weatherStats">
        <strong>{weather.temperature === null ? "--" : weather.temperature.toFixed(1)}<sup>&deg;</sup></strong>
        <b>{weather.pressure === null ? "--" : Math.round(weather.pressure)}<br /><small>Pressure</small></b>
        <b>{weather.humidity === null ? "--" : Math.round(weather.humidity)}<br /><small>Humidity</small></b>
      </div>
      <p>{weather.error || weatherCodeLabel(weather.code)}</p>
    </section>
  );
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

export default memo(WeatherWidget);
