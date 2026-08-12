import { NextResponse } from "next/server";
import { handleInboundFederation, type FedEnvelope } from "@/lib/osp/federation";

/** Max inbound envelope size (DoS guard). */
const MAX_BODY_BYTES = 1_000_000;

/**
 * OSP RFC-009 inbox. No session, no shared secret — the envelope's Country-key
 * signature IS the authentication. Outcomes: ADMITTED (202), DUPLICATE (200,
 * idempotent), DENIED (202, policy), REJECTED (401, bad signature/unknown peer).
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: FedEnvelope;
  try {
    body = JSON.parse(raw) as FedEnvelope;
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  try {
    const result = await handleInboundFederation(body);
    switch (result.status) {
      case "ADMITTED":
        return NextResponse.json({ data: result, success: true }, { status: 202 });
      case "DUPLICATE":
        return NextResponse.json({ data: result, success: true }, { status: 200 });
      case "DENIED":
        return NextResponse.json({ data: result, success: true }, { status: 202 });
      case "REJECTED":
        return NextResponse.json({ error: result.reason }, { status: 401 });
    }
  } catch (error) {
    console.error("Federation inbox error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
