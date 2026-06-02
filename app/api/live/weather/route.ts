import { NextResponse } from "next/server";

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=33.148&longitude=73.751&current=temperature_2m,relative_humidity_2m,pressure_msl,weather_code&timezone=Asia%2FKarachi";

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(WEATHER_URL, {
      signal: controller.signal,
      next: { revalidate: 1800 },
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Weather service is unavailable." }, { status: 502 });
    }

    const payload = await response.json();
    const current = payload.current || {};
    return NextResponse.json(
      {
        temperature: numberOrNull(current.temperature_2m),
        humidity: numberOrNull(current.relative_humidity_2m),
        pressure: numberOrNull(current.pressure_msl),
        code: numberOrNull(current.weather_code),
        time: typeof current.time === "string" ? current.time : null,
      },
      { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json({ error: "Weather could not be loaded." }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

function numberOrNull(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}
