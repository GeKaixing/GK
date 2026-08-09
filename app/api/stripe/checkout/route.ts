import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { priceId } = await request.json();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 查数据库用户
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
  });

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let customerId = dbUser.stripeCustomerId;

  // 如果没有 stripe customer → 创建
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

  // 创建订阅 checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",

    line_items: [
      {
        price: priceId, // Stripe Dashboard创建price
        quantity: 1,
      },
    ],

    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/gekaixing`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/premium`,
  });

  return NextResponse.json({ url: session.url });
}
