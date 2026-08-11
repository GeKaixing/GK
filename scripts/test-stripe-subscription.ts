/**
 * Test the Stripe subscription webhook lifecycle against the local dev server.
 * Creates a real Stripe TEST customer + a matching user, then POSTs signed
 * webhook events (valid signature via the SDK) and verifies the DB state.
 *
 * Requires the dev server on :3000 and STRIPE_WEBHOOK_SECRET in env.
 * Run: npx tsx scripts/test-stripe-subscription.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.development.local" });

const TEST_EMAIL = "stripe.test@example.com";
const WEBHOOK_URL = "http://localhost:3000/api/stripe/webhook";

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const { stripe } = await import("@/lib/stripe");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET missing");
  const secret = webhookSecret;

  const customer = await stripe.customers.create({ email: TEST_EMAIL });
  const customerId = customer.id!;
  const user = await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { stripeCustomerId: customerId },
    create: { email: TEST_EMAIL, userid: "stripe_test", name: "Stripe测试", stripeCustomerId: customerId },
  });
  const subscriptionId = `sub_test_${Date.now()}`;

  async function sendEvent(event: object): Promise<number> {
    const payload = JSON.stringify(event);
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": sig },
      body: payload,
    });
    return res.status;
  }
  const readUser = () => prisma.user.findUnique({ where: { id: user.id } });
  const fmt = (d: Date | null | undefined) => d?.toISOString() ?? "未设置❌";

  console.log("== A. 订阅成功 checkout.session.completed ==");
  const a = await sendEvent({ type: "checkout.session.completed", data: { object: { customer: customer.id, subscription: subscriptionId } } });
  let u = await readUser();
  console.log(`  webhook=${a} isPremium=${u?.isPremium} subId=${u?.stripeSubId?.slice(0, 12)} status=${u?.subscriptionStatus ?? "未设置❌"} expires=${fmt(u?.premiumExpiresAt)}`);

  console.log("== B. 自动续费 invoice.paid ==");
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  const b = await sendEvent({ type: "invoice.paid", data: { object: { subscription: subscriptionId, lines: { data: [{ period: { end: periodEnd } }] } } } });
  u = await readUser();
  console.log(`  webhook=${b} status=${u?.subscriptionStatus ?? "未设置❌"} expires=${fmt(u?.premiumExpiresAt)}`);

  console.log("== C. 订阅更新 customer.subscription.updated (active) ==");
  const c = await sendEvent({ type: "customer.subscription.updated", data: { object: { id: subscriptionId, status: "active", current_period_end: periodEnd, cancel_at_period_end: false } } });
  u = await readUser();
  console.log(`  webhook=${c} status=${u?.subscriptionStatus ?? "未设置❌"} expires=${fmt(u?.premiumExpiresAt)}`);

  console.log("== D. 取消 customer.subscription.deleted ==");
  const d = await sendEvent({ type: "customer.subscription.deleted", data: { object: { id: subscriptionId } } });
  u = await readUser();
  console.log(`  webhook=${d} isPremium=${u?.isPremium}`);

  console.log("== E. 逾期宽限 customer.subscription.updated (past_due) ==");
  const e = await sendEvent({ type: "customer.subscription.updated", data: { object: { id: subscriptionId, status: "past_due", current_period_end: periodEnd, cancel_at_period_end: false } } });
  u = await readUser();
  console.log(`  webhook=${e} status=${u?.subscriptionStatus ?? "未设置❌"} graceEndsAt=${fmt(u?.premiumGraceEndsAt)}`);

  console.log("== F. 无效签名 ==");
  const badSig = await fetch(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=bad" }, body: "{}" });
  console.log(`  webhook=${badSig.status} (期望 400)`);

  // cleanup
  await stripe.customers.del(customer.id).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("test failed:", e);
  process.exit(1);
});
