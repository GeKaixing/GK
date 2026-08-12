import { NextResponse } from "next/server";
import { UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { deliverPending } from "@/lib/osp/federation";
import { createClient } from "@/utils/supabase/server";

/**
 * OSP RFC-009 delivery worker. Processes due outbound envelopes (PENDING /
 * FAILED past their retry window) with exponential backoff.
 *
 * Triggered by an admin session, or by `Authorization: Bearer $FED_DELIVERY_SECRET`
 * (for a Vercel cron / remote scheduler). Fire-and-forget from publish paths and
 * scripts/fed-deliver.ts cover the common cases.
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (process.env.FED_DELIVERY_SECRET && auth === `Bearer ${process.env.FED_DELIVERY_SECRET}`) {
    const result = await deliverPending();
    return NextResponse.json({ data: result, success: true });
  }

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

  const result = await deliverPending();
  return NextResponse.json({ data: result, success: true });
}
