import { logout } from "@/lib/auth";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  await logout();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
