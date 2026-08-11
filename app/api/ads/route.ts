import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";
import { AD_CURRENCY, isValidAdDuration, adPriceCents } from "@/lib/ads/config";
import { getAdMetrics } from "@/lib/ads/metrics";
import { normalizeCtaUrl } from "@/lib/ads/service";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ads = await prisma.sponsoredAd.findMany({
    where: { advertiserId: user.id },
    orderBy: { createdAt: "desc" },
    include: { post: { select: { id: true, content: true } } },
  });

  const withMetrics = await Promise.all(
    ads.map(async (ad) => ({ ...ad, metrics: await getAdMetrics(ad.postId) }))
  );

  return NextResponse.json({ data: withMetrics });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    postId?: string;
    durationDays?: number;
    ctaUrl?: string | null;
    ctaLabel?: string | null;
  };

  if (
    typeof body.postId !== "string" ||
    typeof body.durationDays !== "number" ||
    !isValidAdDuration(body.durationDays)
  ) {
    return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
  }

  const ctaUrl = normalizeCtaUrl(body.ctaUrl);
  if (body.ctaUrl && !ctaUrl) {
    return NextResponse.json({ error: "Invalid CTA URL" }, { status: 400 });
  }
  const ctaLabel =
    typeof body.ctaLabel === "string" && body.ctaLabel.trim()
      ? body.ctaLabel.trim().slice(0, 40)
      : null;

  const post = await prisma.post.findUnique({
    where: { id: body.postId },
    select: { id: true, authorId: true, parentId: true },
  });

  if (!post || post.authorId !== user.id) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (post.parentId !== null) {
    return NextResponse.json({ error: "Cannot promote a reply" }, { status: 400 });
  }

  const existing = await prisma.sponsoredAd.findUnique({
    where: { postId: post.id },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Post already has a campaign" }, { status: 409 });
  }

  const ad = await prisma.sponsoredAd.create({
    data: {
      postId: post.id,
      advertiserId: user.id,
      priceCents: adPriceCents(body.durationDays),
      currency: AD_CURRENCY,
      durationDays: body.durationDays,
      ctaUrl,
      ctaLabel,
    },
    select: { id: true },
  });

  return NextResponse.json({ data: { adId: ad.id } }, { status: 201 });
}
