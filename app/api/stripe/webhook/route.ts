import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import type { SubscriptionStatus } from "@/generated/prisma/enums";

function toStatus(raw: string | undefined, cancelAtPeriodEnd: boolean | undefined): SubscriptionStatus {
  switch (raw) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "incomplete":
    case "paused":
      return "GRACE";
    case "canceled":
    case "incomplete_expired":
    case "unpaid":
      return cancelAtPeriodEnd ? "CANCELED" : "EXPIRED";
    default:
      return "FREE";
  }
}

const isActiveStatus = (raw: string | undefined): boolean =>
  raw === "active" || raw === "trialing" || raw === "past_due" || raw === "paused";

export async function POST(req: Request) {
  const body = await req.text();
  const h = await headers();
  const sig = h.get("stripe-signature");
  let event;

  if (!sig) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    return new Response("Webhook error", { status: 400 });
  }

  // 广告投放付款完成 / 订阅成功（checkout 完成）
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      customer?: unknown;
      subscription?: unknown;
      metadata?: Record<string, string> | null;
    };

    const adId = session.metadata?.adId;
    if (adId) {
      // 广告：一次性付款完成 → PAID（待管理员审核）
      await prisma.sponsoredAd.updateMany({
        where: { id: adId, status: "PENDING_PAYMENT" },
        data: { status: "PAID", paidAt: new Date() },
      });
    } else if (session.customer) {
      const sub = session.subscription as string | { id?: string } | undefined;
      const subId = typeof sub === "string" ? sub : sub?.id;
      await prisma.user.updateMany({
        where: {
          stripeCustomerId: session.customer.toString(),
        },
        data: {
          isPremium: true,
          stripeSubId: subId,
          subscriptionStatus: "ACTIVE",
        },
      });
    }
  }

  // 广告付款会话超时未支付 → 取消
  if (event.type === "checkout.session.expired") {
    const session = event.data.object as {
      metadata?: Record<string, string> | null;
    };
    const adId = session.metadata?.adId;
    if (adId) {
      await prisma.sponsoredAd.updateMany({
        where: { id: adId, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED" },
      });
    }
  }

  // 订阅创建 / 更新（含自动续费滚动周期、取消、逾期宽限）
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const sub = event.data.object as {
      id: string;
      status?: string;
      cancel_at_period_end?: boolean;
      current_period_end?: number;
    };
    const periodEndMs = sub.current_period_end
      ? new Date(sub.current_period_end * 1000)
      : null;

    await prisma.user.updateMany({
      where: {
        stripeSubId: sub.id,
      },
      data: {
        isPremium: isActiveStatus(sub.status),
        subscriptionStatus: toStatus(sub.status, sub.cancel_at_period_end),
        premiumExpiresAt: periodEndMs,
        // 宽限期截止到本期结束；非逾期时清空
        premiumGraceEndsAt: sub.status === "past_due" ? periodEndMs : null,
      },
    });
  }

  // 自动续费成功（新一期开始，滚动 premiumExpiresAt）
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as {
      subscription?: string;
      period_end?: number;
      lines?: { data?: Array<{ period?: { end?: number } }> };
    };
    const subId = invoice.subscription;
    const periodEndSec =
      invoice.lines?.data?.[0]?.period?.end ?? invoice.period_end;

    await prisma.user.updateMany({
      where: { stripeSubId: subId },
      data: {
        subscriptionStatus: "ACTIVE",
        premiumExpiresAt: periodEndSec ? new Date(periodEndSec * 1000) : undefined,
        premiumGraceEndsAt: null,
      },
    });
  }

  // 订阅删除（彻底取消/到期未续）
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;

    await prisma.user.updateMany({
      where: {
        stripeSubId: sub.id,
      },
      data: {
        isPremium: false,
        subscriptionStatus: "CANCELED",
        premiumExpiresAt: null,
        premiumGraceEndsAt: null,
      },
    });
  }

  return new Response("ok");
}
