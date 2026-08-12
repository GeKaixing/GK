import { NextResponse } from "next/server";
import { buildRemoteActorProfile } from "@/lib/osp/federation";

/**
 * OSP RFC-001/009: public actor profile by country + actor id. Serves OUR actors
 * directly (public profile + passport) and proxies recognized remote actors.
 * Used by peers for identity resolution and by us for the federated surface.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ countryId: string; actorId: string }> }
) {
  const { countryId, actorId } = await context.params;
  const profile = await buildRemoteActorProfile(countryId, actorId);
  if (!profile) {
    return NextResponse.json({ error: "Actor not found" }, { status: 404 });
  }
  return NextResponse.json({ data: profile, success: true });
}
