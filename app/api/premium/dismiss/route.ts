import { NextResponse } from "next/server";

const PREMIUM_CARD_DISMISSED_COOKIE = "gkx_premium_card_dismissed_at";
const DISMISS_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(PREMIUM_CARD_DISMISSED_COOKIE, String(Date.now()), {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: DISMISS_TTL_SECONDS,
  });

  return response;
}
