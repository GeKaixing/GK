import { NextResponse } from "next/server";
import { parseDid } from "@/lib/osp/did";
import { buildRemoteActorProfile } from "@/lib/osp/federation";

/**
 * OSP RFC-001: resolve a did:osp:<country>:<actor> to a public profile.
 * Local actors are served directly; remote actors are fetched (and cached) from
 * the recognized peer's federation endpoint.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const did = searchParams.get("did");
  if (!did) {
    return NextResponse.json({ error: "Missing did param" }, { status: 400 });
  }

  let countryId: string;
  let actorId: string;
  try {
    ({ countryId, actorId } = parseDid(did));
  } catch {
    return NextResponse.json({ error: "Invalid DID" }, { status: 400 });
  }

  const profile = await buildRemoteActorProfile(countryId, actorId);
  if (!profile) {
    return NextResponse.json({ error: "Actor not found or not recognized" }, { status: 404 });
  }
  return NextResponse.json({ data: profile, success: true });
}
