import { NextResponse } from "next/server";

const CURRENCY_CODES = new Set(["CAD", "PKR", "USD", "GBP", "EUR", "AUD", "AED", "SAR"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = normalizeCurrency(searchParams.get("from") || "CAD");
  const to = normalizeCurrency(searchParams.get("to") || "PKR");

  if (!CURRENCY_CODES.has(from) || !CURRENCY_CODES.has(to)) {
    return NextResponse.json({ error: "Unsupported currency." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${from}`, {
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Currency service is unavailable." }, { status: 502 });
    }

    const payload = await response.json();
    const rate = Number(payload?.rates?.[to]);
    if (!Number.isFinite(rate)) {
      return NextResponse.json({ error: "Currency rate is unavailable." }, { status: 502 });
    }

    return NextResponse.json(
      { rate, time: typeof payload.time_last_update_utc === "string" ? payload.time_last_update_utc : null },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json({ error: "Currency rate could not be loaded." }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase();
}
