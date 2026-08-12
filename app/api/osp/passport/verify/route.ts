import { NextResponse } from "next/server";
import { getActorByUserId } from "@/lib/osp/actor";
import { getPassport, verifyPassport } from "@/lib/osp/passport";
import { createClient } from "@/utils/supabase/server";

/**
 * OSP RFC-003: verify a passport's Country-key signature.
 * Authenticated. `actorId` is optional — defaults to the caller's own actor.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const actorId = searchParams.get("actorId") ?? (await getActorByUserId(user.id))?.id;
    if (!actorId) {
      return NextResponse.json({ error: "No actor found" }, { status: 404 });
    }

    const passport = await getPassport(actorId);
    if (!passport) {
      return NextResponse.json({ data: { valid: false, passport: null }, success: true });
    }
    const valid = await verifyPassport(passport);
    return NextResponse.json({
      data: {
        valid,
        passport: {
          id: passport.id,
          did: `did:osp:${passport.countryId}:${passport.actorId}`,
          status: passport.status,
          publicKey: passport.publicKey,
          issuedAt: passport.issuedAt,
        },
      },
      success: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verify failed" },
      { status: 500 }
    );
  }
}
