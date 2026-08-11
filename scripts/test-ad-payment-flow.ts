/**
 * 广告投放「完整付款流程」端到端测试（Stripe TEST mode）。
 *
 * 走真实 HTTP 路由 + 真实签名 webhook：
 *   发帖 → 建投放单(PENDING_PAYMENT) → Stripe Checkout 会话
 *   → webhook 付款完成(PAID) → 管理员审核(ACTIVE)
 *   → 信息流按固定间隔展示(带赞助标/CTA) → 管理员暂停后从信息流消失
 *
 * 前置：dev server 运行在 :3000（npm run dev）；Supabase/Stripe test 密钥在 .env.development.local。
 * 运行：npx tsx scripts/test-ad-payment-flow.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.development.local" });

const BASE = "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PROJECT_REF = SUPABASE_URL.replace("https://", "").split(".")[0];
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

const RUN = Date.now();
const ADV_EMAIL = `ads.adv.${RUN}@test.local`;
const ADMIN_EMAIL = `ads.admin.${RUN}@test.local`;
const PASSWORD = "TestPass123!";

// ---------- Supabase auth helpers ----------
async function adminCreateUser(email: string, password: string): Promise<{ id: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`adminCreateUser failed: ${JSON.stringify(json)}`);
  return json;
}

async function adminDeleteUser(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  }).catch(() => {});
}

async function signIn(email: string, password: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`signIn failed: ${JSON.stringify(json)}`);
  return json;
}

/** 把 supabase-js session 编码成 @supabase/ssr 的 sb-<ref>-auth-token cookie。
 *  注意：@supabase/ssr 默认 cookie 值是「原始 JSON 字符串」（非 base64），
 *  只有带 `base64-` 前缀时才做 base64url 解码。 */
function sessionCookie(session: any): string {
  const value = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    expires_in: session.expires_in,
    token_type: session.token_type ?? "bearer",
    user: session.user,
  };
  return `sb-${PROJECT_REF}-auth-token=${JSON.stringify(value)}`;
}

async function api(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cookie) headers.Cookie = opts.cookie;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, data };
}

function check(name: string, cond: boolean, extra = ""): void {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " | " + extra : ""}`);
}

async function main(): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const { stripe } = await import("@/lib/stripe");

  let advAuthId = "";
  let adminAuthId = "";
  let postId = "";
  let adId = "";
  const cleanups: Array<() => Promise<void>> = [];

  try {
    // 1) 创建测试用户（Supabase auth + Prisma User 行，管理员赋 ADMIN）
    const advAuth = await adminCreateUser(ADV_EMAIL, PASSWORD);
    const adminAuth = await adminCreateUser(ADMIN_EMAIL, PASSWORD);
    advAuthId = advAuth.id;
    adminAuthId = adminAuth.id;

    const advUser = await prisma.user.upsert({
      where: { email: ADV_EMAIL },
      update: { role: "STANDARD" },
      create: { id: advAuth.id, email: ADV_EMAIL, userid: `ads_adv_${RUN}`, name: "广告主测试", role: "STANDARD" },
    });
    const adminUser = await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: { role: "ADMIN" },
      create: { id: adminAuth.id, email: ADMIN_EMAIL, userid: `ads_admin_${RUN}`, name: "管理员测试", role: "ADMIN" },
    });
    check("创建测试用户(广告主/管理员)", !!advUser && !!adminUser);
    cleanups.push(() => prisma.user.deleteMany({ where: { email: { in: [ADV_EMAIL, ADMIN_EMAIL] } } }));

    // 2) 登录并构造 SSR cookie
    const advSession = await signIn(ADV_EMAIL, PASSWORD);
    const adminSession = await signIn(ADMIN_EMAIL, PASSWORD);
    const advCookie = sessionCookie(advSession);
    const adminCookie = sessionCookie(adminSession);
    check("广告主/管理员登录并构造会话 cookie", !!advSession.access_token && !!adminSession.access_token);

    const sanity = await api("GET", "/api/ads", { cookie: advCookie });
    check("广告主会话可用(/api/ads 返回 200)", sanity.status === 200, `status=${sanity.status}`);

    // 3) 广告主发帖
    const content = `<p>【广告】完整付款流程测试帖 ${RUN}</p>`;
    const created = await api("POST", "/api/post", { cookie: advCookie, body: { content } });
    postId = created.data?.data?.[0]?.id ?? created.data?.id ?? "";
    check("广告主发帖成功", created.status === 200 && !!postId, `status=${created.status} postId=${postId}`);

    // 4) 创建投放单
    const createdAd = await api("POST", "/api/ads", {
      cookie: advCookie,
      body: { postId, durationDays: 3, ctaUrl: "https://example.com/ads-test", ctaLabel: "立即了解" },
    });
    adId = createdAd.data?.data?.adId ?? "";
    check("创建投放单(201)", createdAd.status === 201 && !!adId, `status=${createdAd.status} adId=${adId}`);

    let ad = await prisma.sponsoredAd.findUnique({ where: { id: adId } });
    check("DB 状态 = PENDING_PAYMENT", ad?.status === "PENDING_PAYMENT", `status=${ad?.status}`);

    // 5) Stripe Checkout（一次性付款）
    const checkout = await api("POST", "/api/stripe/checkout-ad", { cookie: advCookie, body: { adId } });
    const checkoutOk =
      checkout.status === 200 && typeof checkout.data?.url === "string" && checkout.data.url.startsWith("https://checkout.stripe.com");
    check("创建 Stripe Checkout 会话(一次性付款)", checkoutOk, `status=${checkout.status} url=${checkout.data?.url ?? "?"}`);

    ad = await prisma.sponsoredAd.findUnique({ where: { id: adId } });
    const sessionId = ad?.stripeSessionId ?? "";
    check("DB 已记录 stripeSessionId", !!sessionId);

    // 6) 付款完成：真实签名 webhook → PAID
    const sessionObj = await stripe.checkout.sessions.retrieve(sessionId);
    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: sessionObj } });
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const whRes = await fetch(`${BASE}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": sig },
      body: payload,
    });
    ad = await prisma.sponsoredAd.findUnique({ where: { id: adId } });
    check(
      "付款完成 webhook → PAID(含 paidAt)",
      whRes.status === 200 && ad?.status === "PAID" && !!ad.paidAt,
      `webhook=${whRes.status} status=${ad?.status}`,
    );

    // 7) 管理员审核通过 → ACTIVE
    const approve = await api("PATCH", `/api/admin/ads/${adId}`, { cookie: adminCookie, body: { action: "approve" } });
    ad = await prisma.sponsoredAd.findUnique({ where: { id: adId } });
    check(
      "管理员审核通过 → ACTIVE(起止时间已算)",
      approve.status === 200 && ad?.status === "ACTIVE" && !!ad.startsAt && !!ad.endsAt,
      `status=${approve.status} ad=${ad?.status} endsAt=${ad?.endsAt?.toISOString() ?? "?"}`,
    );

    // 8) 信息流按固定间隔展示广告（带赞助标/CTA）
    const feed1 = await api("GET", "/api/post/feed?limit=20");
    const items1 = feed1.data?.data ?? [];
    const adIdx = items1.map((it: any, i: number) => (it.isSponsored ? i : -1)).filter((i: number) => i >= 0);
    const shown = items1.find((it: any) => it.isSponsored && it.id === postId);
    check(
      "信息流在固定间隔展示广告(isSponsored+CTA)",
      adIdx.length > 0 && !!shown,
      `广告位索引=${adIdx.join(",")} 字段=${JSON.stringify(shown ? { by: shown.sponsoredBy, cta: shown.ctaUrl, label: shown.ctaLabel } : {})}`,
    );

    // 9) 管理员暂停 → 信息流不再展示
    const pause = await api("PATCH", `/api/admin/ads/${adId}`, { cookie: adminCookie, body: { action: "pause" } });
    ad = await prisma.sponsoredAd.findUnique({ where: { id: adId } });
    const feed2 = await api("GET", "/api/post/feed?limit=20");
    const stillShown = (feed2.data?.data ?? []).some((it: any) => it.isSponsored && it.id === postId);
    check("管理员暂停 → PAUSED 且信息流不再展示", pause.status === 200 && ad?.status === "PAUSED" && !stillShown, `ad=${ad?.status} stillShown=${stillShown}`);

    console.log("\n全部通过 ✔ 完整付款流程走通");
  } finally {
    // 清理
    await prisma.sponsoredAd.deleteMany({ where: { id: adId } }).catch(() => {});
    await prisma.post.deleteMany({ where: { id: postId } }).catch(() => {});
    await Promise.all(cleanups.map((fn) => fn().catch(() => {})));
    await adminDeleteUser(advAuthId).catch(() => {});
    await adminDeleteUser(adminAuthId).catch(() => {});
    await prisma.$disconnect();
    console.log("已清理测试数据（用户/帖子/投放单）");
  }
}

main().catch((e) => {
  console.error("test failed:", e);
  process.exit(1);
});
