import { NextResponse } from "next/server";

/**
 * 代理 OpenAI 兼容接口的 /models 列表请求。
 * 浏览器直接 fetch 第三方端点会因 CORS 被拦截，这里在服务端转发。
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as {
    baseURL?: string;
    apiKey?: string;
  };

  const baseURL = (body.baseURL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (body.apiKey ?? "").trim();

  if (!baseURL || !apiKey) {
    return NextResponse.json({ error: "baseURL and apiKey are required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${baseURL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `HTTP ${res.status}` }, { status: res.status });
    }

    const data = (await res.json()) as unknown;
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load models";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
