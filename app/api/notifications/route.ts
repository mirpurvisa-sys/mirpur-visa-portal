import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canViewResource } from "@/lib/permissions";
import { getCaseNotificationFeed, markCaseNotificationsRead } from "@/lib/caseNotifications";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to view notifications." }, { status: 401, headers });
  if (!canViewResource(user, "cases")) {
    return NextResponse.json({ viewerId: user.id, notifications: [], unreadCount: 0, latestNotificationId: null }, { headers });
  }
  return NextResponse.json(await getCaseNotificationFeed(getDb(), user.id), { headers });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to update notifications." }, { status: 401, headers });
  if (!canViewResource(user, "cases")) return NextResponse.json({ error: "Access denied." }, { status: 403, headers });
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  }
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid notification selection." }, { status: 400, headers });
  }
  if (body?.all === true && validId(body.beforeId)) {
    await markCaseNotificationsRead(getDb(), user.id, { beforeId: body.beforeId });
  } else if (Array.isArray(body?.ids) && body.ids.length > 0 && body.ids.length <= 100 && body.ids.every(validId)) {
    await markCaseNotificationsRead(getDb(), user.id, { ids: body.ids });
  } else {
    return NextResponse.json({ error: "Invalid notification selection." }, { status: 400, headers });
  }
  return NextResponse.json(await getCaseNotificationFeed(getDb(), user.id), { headers });
}
