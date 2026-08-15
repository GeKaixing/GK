import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { encodeAuthToken, getAuthSecret } from "@/lib/auth/jwt";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.GO_API_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { error: "GO_API_BASE_URL is not configured" },
      { status: 500 },
    );
  }

  const token = await encodeAuthToken({
    token: {
      sub: session.user.id,
      email: session.user.email ?? undefined,
      name: session.user.name ?? undefined,
    },
    secret: getAuthSecret(),
    maxAge: 5 * 60,
    salt: "go-api-proxy",
  });

  const response = await fetch(`${baseUrl}/api/v1/whoami`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
