import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { adId } = await request.json();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ad = await prisma.sponsoredAd.findUnique({
    where: { id: adId },
  });

  if (!ad || ad.advertiserId !== user.id) {
    return NextResponse.json({ error: "Ad not found" }, { status: 404 });
  }

  if (ad.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ error: "Ad is not pending payment" }, { status: 400 });
  }

  // 复用订阅的 Stripe customer 创建逻辑，保证同一用户在 Stripe 只有一个客户。
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  let customerId = dbUser?.stripeCustomerId ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  // 一次性付款：用 price_data 直传金额，无需在 Stripe 后台预建 Price。
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    metadata: { adId: ad.id },
    line_items: [
      {
        price_data: {
          currency: ad.currency,
          unit_amount: ad.priceCents,
          product_data: { name: "Sponsored post" },
        },
        quantity: 1,
      },
    ],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/gekaixing/ads?success=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/gekaixing/ads`,
  });

  await prisma.sponsoredAd.update({
    where: { id: ad.id },
    data: { stripeSessionId: session.id },
  });

  return NextResponse.json({ url: session.url });
}
