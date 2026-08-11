import { NextResponse } from "next/server";

const HOME_FEED_LAST_SEEN_COOKIE = "gkx_home_feed_last_seen_at";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(HOME_FEED_LAST_SEEN_COOKIE, new Date().toISOString(), {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
