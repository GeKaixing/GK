import { NextResponse } from "next/server";
import { buildWellKnown } from "@/lib/osp/federation";

/**
 * OSP RFC-009 discovery document (served at /.well-known/osp via a rewrite —
 * App Router ignores dot-prefixed folders). Public: any peer Country fetches
 * this to learn our country id, public key and federation endpoint.
 */
export async function GET() {
  try {
    return NextResponse.json(await buildWellKnown());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
