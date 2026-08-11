import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";
import { getAdMetrics } from "@/lib/ads/metrics";

export async function GET(
  _request: Request,
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

  const ad = await prisma.sponsoredAd.findUnique({
    where: { id },
    select: { advertiserId: true, postId: true },
  });
  if (!ad || ad.advertiserId !== user.id) {
    return NextResponse.json({ error: "Ad not found" }, { status: 404 });
  }

  return NextResponse.json({ data: await getAdMetrics(ad.postId) });
}

// 广告主取消自己的投放单（仅未付款 / 待审核时可取消）。
export async function PATCH(
  _request: Request,
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

  const ad = await prisma.sponsoredAd.findUnique({
    where: { id },
    select: { advertiserId: true, status: true },
  });
  if (!ad || ad.advertiserId !== user.id) {
    return NextResponse.json({ error: "Ad not found" }, { status: 404 });
  }
  if (ad.status !== "PENDING_PAYMENT" && ad.status !== "PAID") {
    return NextResponse.json({ error: "Ad cannot be cancelled now" }, { status: 400 });
  }

  await prisma.sponsoredAd.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ success: true });
}
