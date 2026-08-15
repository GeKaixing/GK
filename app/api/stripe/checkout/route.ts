import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const checkoutBodySchema = z.object({
  priceId: z.string().min(1),
});

function getAllowedPriceIds(): Set<string> {
  const candidates = [
    process.env.STRIPE_PRICE_BASIC,
    process.env.STRIPE_PRICE_PREMIUM,
    process.env.STRIPE_PRICE_PREMIUM_PLUS,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_PREMIUM_PLUS,
  ];
  const values = candidates.filter((value): value is string => Boolean(value && value.trim()));
  return new Set(values);
}

export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const authSession = await auth();
    if (!authSession?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", data: null },
        { status: 401 },
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body", data: null },
        { status: 400 },
      );
    }

    const parsedBody = checkoutBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body", data: null },
        { status: 400 },
      );
    }
    const { priceId } = parsedBody.data;

    const allowedPriceIds = getAllowedPriceIds();
    if (allowedPriceIds.size > 0 && !allowedPriceIds.has(priceId)) {
      return NextResponse.json(
        { success: false, error: "Invalid Stripe price id", data: null },
        { status: 400 },
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: authSession.user.id },
    });

    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: "User not found", data: null },
        { status: 404 },
      );
    }

    let customerId = dbUser.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: dbUser.email,
        metadata: {
          userId: dbUser.id,
        },
      });

      customerId = customer.id;

      await prisma.user.update({
        where: { id: dbUser.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId: dbUser.id,
        priceId,
      },
      success_url: `${appUrl}/gekaixing/premium?checkout=success`,
      cancel_url: `${appUrl}/gekaixing/premium?checkout=cancel`,
    });

    if (!checkoutSession.url) {
      return NextResponse.json(
        { success: false, error: "Stripe checkout URL is unavailable", data: null },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      error: null,
      data: {
        url: checkoutSession.url,
      },
    });
  } catch (error) {
    console.error("Stripe checkout failed:", error);
    return NextResponse.json(
      { success: false, error: "Stripe checkout failed", data: null },
      { status: 500 },
    );
  }
}
