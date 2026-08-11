import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";
import { AdStatus, UserRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

type AdAction = "approve" | "pause" | "resume" | "end" | "reject";

// 状态迁移矩阵：action → { 允许的来源状态, 目标状态 }
const ACTIONS: Record<AdAction, { from: AdStatus[]; to: AdStatus }> = {
  approve: { from: [AdStatus.PAID], to: AdStatus.ACTIVE },
  pause: { from: [AdStatus.ACTIVE], to: AdStatus.PAUSED },
  resume: { from: [AdStatus.PAUSED], to: AdStatus.ACTIVE },
  end: { from: [AdStatus.ACTIVE, AdStatus.PAUSED], to: AdStatus.ENDED },
  reject: {
    from: [AdStatus.PENDING_PAYMENT, AdStatus.PAID, AdStatus.ACTIVE],
    to: AdStatus.REJECTED,
  },
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const body = (await request.json()) as { action?: AdAction };
  const action = body.action;
  if (!action || !ACTIONS[action]) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const ad = await prisma.sponsoredAd.findUnique({
    where: { id },
    select: { id: true, status: true, durationDays: true },
  });
  if (!ad) {
    return NextResponse.json({ error: "Ad not found" }, { status: 404 });
  }
  if (!ACTIONS[action].from.includes(ad.status)) {
    return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
  }

  const data: Prisma.SponsoredAdUpdateInput = { status: ACTIONS[action].to };
  if (action === "approve") {
    const now = new Date();
    data.startsAt = now;
    data.endsAt = new Date(now.getTime() + ad.durationDays * 24 * 60 * 60 * 1000);
  }

  await prisma.sponsoredAd.update({ where: { id }, data });

  return NextResponse.json({ success: true });
}
