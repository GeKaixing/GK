import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { headers } from "next/headers";
import type Stripe from "stripe";

type WebhookEventStatus = "PROCESSING" | "PROCESSED" | "FAILED";

async function reserveWebhookEvent(event: Stripe.Event): Promise<"PROCESS" | "SKIP"> {
  const existingRows = await prisma.$queryRaw<{ status: string }[]>`
    SELECT "status"
    FROM "StripeWebhookEvent"
    WHERE "id" = ${event.id}
    LIMIT 1
  `;

  const existing = existingRows[0]?.status;
  if (existing === "PROCESSED") {
    return "SKIP";
  }

  if (existing) {
    await prisma.$executeRaw`
      UPDATE "StripeWebhookEvent"
      SET
        "type" = ${event.type},
        "status" = ${"PROCESSING" satisfies WebhookEventStatus},
        "attemptCount" = "attemptCount" + 1,
        "lastError" = NULL,
        "updatedAt" = NOW()
      WHERE "id" = ${event.id}
    `;
    return "PROCESS";
  }

  await prisma.$executeRaw`
    INSERT INTO "StripeWebhookEvent" ("id", "type", "status", "attemptCount", "createdAt", "updatedAt")
    VALUES (${event.id}, ${event.type}, ${"PROCESSING" satisfies WebhookEventStatus}, 1, NOW(), NOW())
  `;

  return "PROCESS";
}

async function completeWebhookEvent(eventId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "StripeWebhookEvent"
    SET
      "status" = ${"PROCESSED" satisfies WebhookEventStatus},
      "lastError" = NULL,
      "updatedAt" = NOW()
    WHERE "id" = ${eventId}
  `;
}

async function failWebhookEvent(eventId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown webhook processing error";
  const normalized = message.slice(0, 1500);

  await prisma.$executeRaw`
    UPDATE "StripeWebhookEvent"
    SET
      "status" = ${"FAILED" satisfies WebhookEventStatus},
      "lastError" = ${normalized},
      "updatedAt" = NOW()
    WHERE "id" = ${eventId}
  `;
}

async function processWebhookEvent(event: Stripe.Event): Promise<void> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

    if (customerId) {
      await prisma.user.updateMany({
        where: {
          stripeCustomerId: customerId,
        },
        data: {
          isPremium: true,
          stripeSubId: subscriptionId ?? null,
          subscriptionStatus: "ACTIVE",
        },
      });
    }
    return;
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    const periodEndUnix = (sub as { current_period_end?: number }).current_period_end;
    const currentPeriodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;
    const isActiveLike = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
    const isGrace = sub.cancel_at_period_end && isActiveLike;
    const mappedStatus =
      sub.status === "canceled"
        ? "CANCELED"
        : isGrace
          ? "GRACE"
          : isActiveLike
            ? "ACTIVE"
            : "EXPIRED";

    await prisma.user.updateMany({
      where: {
        OR: [
          { stripeSubId: sub.id },
          ...(customerId ? [{ stripeCustomerId: customerId }] : []),
        ],
      },
      data: {
        stripeSubId: sub.id,
        stripePriceId: sub.items.data[0]?.price?.id ?? null,
        isPremium: isActiveLike,
        subscriptionStatus: mappedStatus,
        premiumExpiresAt: currentPeriodEnd,
        premiumGraceEndsAt: isGrace ? currentPeriodEnd : null,
      },
    });
  }
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const body = await req.text();
  const h = await headers();
  const sig = h.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event: Stripe.Event;

  if (!sig) {
    return new Response("Missing stripe-signature", { status: 400 });
  }
  if (!webhookSecret) {
    return new Response("Missing STRIPE_WEBHOOK_SECRET", { status: 500 });
  }

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    return new Response("Webhook error", { status: 400 });
  }

  const decision = await reserveWebhookEvent(event);
  if (decision === "SKIP") {
    return new Response("ok");
  }

  try {
    await processWebhookEvent(event);
    await completeWebhookEvent(event.id);
    return new Response("ok");
  } catch (error) {
    await failWebhookEvent(event.id, error);
    console.error("Stripe webhook processing failed:", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
}
