import { NextResponse } from "next/server";
import { RecognitionState, UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { fetchCountryWellKnown, setRecognition } from "@/lib/osp/federation";
import { createClient } from "@/utils/supabase/server";

/**
 * OSP RFC-009/011 admin: add a peer Country (from its well-known document) and
 * set recognition state. Admin-only (mirrors app/api/admin/ads/[id]).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (admin?.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { action, host, countryId, state } = await request.json();

    if (action === "add") {
      if (!host) {
        return NextResponse.json({ error: "Missing host" }, { status: 400 });
      }
      const doc = await fetchCountryWellKnown(host);
      const remote = await prisma.remoteCountry.upsert({
        where: { id: doc.country_id },
        update: {
          name: doc.name,
          publicKey: doc.public_key,
          federationEndpoint: doc.federation_endpoint,
        },
        create: {
          id: doc.country_id,
          name: doc.name,
          publicKey: doc.public_key,
          federationEndpoint: doc.federation_endpoint,
        },
      });
      // Default stance: UNKNOWN (must be explicitly recognized before content is admitted).
      await setRecognition(remote.id, RecognitionState.UNKNOWN);
      return NextResponse.json({ data: remote, success: true });
    }

    if (action === "recognize") {
      if (!countryId || !state) {
        return NextResponse.json({ error: "Missing countryId or state" }, { status: 400 });
      }
      const remote = await prisma.remoteCountry.findUnique({ where: { id: countryId } });
      if (!remote) {
        return NextResponse.json({ error: "Unknown remote country — add it first" }, { status: 404 });
      }
      if (!Object.values(RecognitionState).includes(state)) {
        return NextResponse.json({ error: `Invalid state: ${state}` }, { status: 400 });
      }
      const recognition = await setRecognition(countryId, state as RecognitionState);
      return NextResponse.json({ data: recognition, success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Federation admin error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
