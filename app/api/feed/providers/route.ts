import { NextResponse } from "next/server";
import { listFeedProviders } from "@/lib/feed/providers/registry";

/**
 * OSP RFC-014 transparency: the registered feed providers and their declared
 * data sources, ranking signals, moderation interactions and policies.
 * Public by design.
 */
export async function GET() {
  return NextResponse.json({ data: listFeedProviders(), success: true });
}
