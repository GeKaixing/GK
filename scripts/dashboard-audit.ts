/**
 * Dashboard data audit — cross-checks lib/dashboard/service.ts output against
 * independent raw SQL via Prisma. Run: npx tsx --env-file=.env.development.local scripts/dashboard-audit.ts
 */
import { prisma } from "@/lib/prisma";
import { UserActionType } from "@/generated/prisma/enums";
import {
  getDashboardHomeData,
  getDashboardAffiliationsData,
  getDashboardRadarData,
  getDashboardAcquireHandlesData,
  getDashboardHireTalentData,
  getDashboardSupportData,
  getDashboardBillingData,
  getDashboardSettingsData,
} from "@/lib/dashboard/service";

const now = new Date();
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

async function main() {
  console.log(`\n=== DASHBOARD AUDIT ===`);
  console.log(`now(local): ${now.toString()}`);
  console.log(`now(iso)  : ${now.toISOString()}`);
  console.log(`timezone  : ${TZ}`);
  console.log(`local day : ${localDay(now)} | UTC day: ${utcDay(now)}`);
  console.log(`local day == UTC day? ${localDay(now) === utcDay(now)}`);

  // ---- A. Raw platform truth ----
  const [totUsers, totPremium, totRootPosts, totReplies, totMessages, newUsers7d, newRootPosts7d] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isPremium: true } }),
      prisma.post.count({ where: { parentId: null } }),
      prisma.post.count({ where: { parentId: { not: null } } }),
      prisma.message.count(),
      prisma.user.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * 864e5) } } }),
      prisma.post.count({ where: { parentId: null, createdAt: { gte: new Date(now.getTime() - 7 * 864e5) } } }),
    ]);
  console.log(`\n[Platform raw] users=${totUsers} premium=${totPremium} rootPosts=${totRootPosts} replies=${totReplies} messages=${totMessages} newUsers7d=${newUsers7d} newRootPosts7d=${newRootPosts7d}`);

  // ---- B. Pick a candidate dashboard owner ----
  const active = await prisma.post.groupBy({
    by: ["authorId"],
    where: { parentId: null },
    _count: { _all: true },
    orderBy: { _count: { authorId: "desc" } },
    take: 5,
  });
  console.log(`\n[Top authors by root posts] ${active.map((a) => `${a.authorId.slice(0, 8)}:${a._count._all}`).join(", ")}`);
  const userId = active[0]?.authorId;
  if (!userId) {
    console.log("No posts at all — cannot audit per-user dashboard. Aborting.");
    return;
  }

  // ---- C. Home data ----
  const home = await getDashboardHomeData(userId);
  console.log(`\n=== getDashboardHomeData(${userId.slice(0, 8)}…) ===`);
  console.log("summary:", JSON.stringify(home.summary));
  console.log("coreMetrics:", JSON.stringify(home.coreMetrics));
  console.log("rates:", JSON.stringify(home.rates));
  console.log("engagement:", JSON.stringify(home.engagement));
  console.log("trend:", home.trend.map((t) => `${t.date}:${t.posts}/${t.replies}`).join(" "));
  console.log("dauTrend:", home.dauTrend.map((d) => `${d.date}:${d.dau}`).join(" "));
  console.log("funnel:", JSON.stringify(home.funnel, null, 0));
  console.log("trafficSources:", JSON.stringify(home.trafficSources));
  console.log("audienceSegments:", JSON.stringify(home.audienceSegments));
  console.log("contentSegments:", JSON.stringify(home.contentSegments));
  console.log("retentionCohorts:", home.retentionCohorts.map((c) => `${c.cohortDate}:u${c.users}/d1${c.d1Retention.toFixed(1)}/d7${c.d7Retention.toFixed(1)}`).join(" "));
  console.log("retentionWeeklyCohorts:", home.retentionWeeklyCohorts.map((c) => `${c.cohortDate}:u${c.users}/d1${c.d1Retention.toFixed(1)}/d7${c.d7Retention.toFixed(1)}`).join(" "));

  // ---- C1. Summary cross-check ----
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const [followingRaw, followerRaw, myPostsRaw, myRepliesRaw, myMessagesRaw, weeklyRepliesRaw, weeklyPostsRaw] =
    await Promise.all([
      prisma.follow.count({ where: { followerId: userId, status: "FOLLOWING" } }),
      prisma.follow.count({ where: { followingId: userId, status: "FOLLOWING" } }),
      prisma.post.count({ where: { authorId: userId, parentId: null } }),
      prisma.post.count({ where: { authorId: userId, parentId: { not: null } } }),
      prisma.message.count({ where: { senderId: userId } }),
      prisma.post.count({ where: { authorId: userId, parentId: { not: null }, createdAt: { gte: weekAgo } } }),
      prisma.post.count({ where: { authorId: userId, parentId: null, createdAt: { gte: weekAgo } } }),
    ]);
  console.log(`\n[summary vs raw] following=${home.summary.totalUsers}/${followingRaw} followers=${home.summary.totalPremiumUsers}/${followerRaw} posts=${home.summary.totalPosts}/${myPostsRaw} replies=${home.summary.totalReplies}/${myRepliesRaw} messages=${home.summary.totalMessages}/${myMessagesRaw} weekReplies=${home.summary.weeklyNewUsers}/${weeklyRepliesRaw} weekPosts=${home.summary.weeklyNewPosts}/${weeklyPostsRaw}`);

  // ---- C2. recent posts metrics cross-check ----
  const weekAgoExact = new Date(now);
  weekAgoExact.setDate(now.getDate() - 7);
  for (const p of home.recentPosts) {
    const [imp, clk, prf, rep, impPv, clkPv, prfPv, repPv] = await Promise.all([
      prisma.userAction.groupBy({ by: ["targetPostId", "userId"], where: { userId: { not: userId }, actionType: "FEED_IMPRESSION", targetAuthorId: userId, targetPostId: p.id, createdAt: { gte: weekAgoExact } } }),
      prisma.userAction.groupBy({ by: ["targetPostId", "userId"], where: { userId: { not: userId }, actionType: "POST_CLICK", targetAuthorId: userId, targetPostId: p.id, createdAt: { gte: weekAgoExact }, NOT: { metadata: { contains: '"kind":"profile_enter"' } } } }),
      prisma.userAction.groupBy({ by: ["targetPostId", "userId"], where: { userId: { not: userId }, actionType: "POST_CLICK", targetAuthorId: userId, targetPostId: p.id, createdAt: { gte: weekAgoExact }, metadata: { contains: '"kind":"profile_enter"' } } }),
      prisma.userAction.groupBy({ by: ["targetPostId", "userId"], where: { userId: { not: userId }, actionType: "REPLY_CREATE", targetAuthorId: userId, targetPostId: p.id, createdAt: { gte: weekAgoExact } } }),
      prisma.userAction.groupBy({ by: ["targetPostId"], where: { userId: { not: userId }, actionType: "FEED_IMPRESSION", targetAuthorId: userId, targetPostId: p.id, createdAt: { gte: weekAgoExact } }, _count: { _all: true } }),
      prisma.userAction.groupBy({ by: ["targetPostId"], where: { userId: { not: userId }, actionType: "POST_CLICK", targetAuthorId: userId, targetPostId: p.id, createdAt: { gte: weekAgoExact }, NOT: { metadata: { contains: '"kind":"profile_enter"' } } }, _count: { _all: true } }),
      prisma.userAction.groupBy({ by: ["targetPostId"], where: { userId: { not: userId }, actionType: "POST_CLICK", targetAuthorId: userId, targetPostId: p.id, createdAt: { gte: weekAgoExact }, metadata: { contains: '"kind":"profile_enter"' } }, _count: { _all: true } }),
      prisma.userAction.groupBy({ by: ["targetPostId"], where: { userId: { not: userId }, actionType: "REPLY_CREATE", targetAuthorId: userId, targetPostId: p.id, createdAt: { gte: weekAgoExact } }, _count: { _all: true } }),
    ]);
    const raw = {
      impressions: imp.length, postClicks: clk.length, profileEnters: prf.length, replies: rep.length,
      impressionsPv: impPv[0]?._count._all ?? 0, postClicksPv: clkPv[0]?._count._all ?? 0,
      profileEntersPv: prfPv[0]?._count._all ?? 0, repliesPv: repPv[0]?._count._all ?? 0,
    };
    const m = p.metrics;
    const match =
      raw.impressions === m.impressions && raw.postClicks === m.postClicks &&
      raw.profileEnters === m.profileEnters && raw.replies === m.repliesReceived &&
      raw.impressionsPv === m.impressionsPv && raw.postClicksPv === m.postClicksPv &&
      raw.profileEntersPv === m.profileEntersPv && raw.repliesPv === m.repliesReceivedPv;
    console.log(`  post ${p.id.slice(0, 8)} ${match ? "OK " : "MISMATCH"}  got={imp:${m.impressions},clk:${m.postClicks},prf:${m.profileEnters},rep:${m.repliesReceived},impPv:${m.impressionsPv},clkPv:${m.postClicksPv},prfPv:${m.profileEntersPv},repPv:${m.repliesReceivedPv}} raw={${JSON.stringify(raw)}}`);
  }

  // ---- C3. Funnel reply-step denominator check ----
  const funnel = home.funnel;
  const replyStep = funnel.find((f) => f.step === "reply");
  const followStep = funnel.find((f) => f.step === "follow");
  const impressionStep = funnel.find((f) => f.step === "impression");
  if (replyStep) {
    const expectedFromPrev = followStep?.users && followStep.users > 0 ? (replyStep.users / followStep.users) * 100 : 0;
    console.log(`\n[funnel] reply step: reported conversionFromPrev=${replyStep.conversionFromPrev.toFixed(2)}% ; if it were replies/follow (prev step) it would be ${expectedFromPrev.toFixed(2)}% ; if replies/impressions it's ${impressionStep?.users ? (replyStep.users / impressionStep.users) * 100 : 0}%`);
  }

  // ---- C4. DAU trend: cross-check each day against raw ----
  const todayLocal = startOfDay(now);
  const daysBack = [...Array(14).keys()].map((i) => i); // 0..13
  const dauByLocalDay = new Map<string, number>();
  const dauByUtcDay = new Map<string, number>();
  // replicate reported bucketing: local keys vs UTC key labels
  const reportedLabels = home.dauTrend.map((d) => d.date);
  for (let i = 0; i < 14; i++) {
    const start = new Date(now);
    start.setDate(now.getDate() - i);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const rows = await prisma.userAction.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { userId: true, createdAt: true },
    });
    const loc = new Set<string>();
    const utc = new Set<string>();
    rows.forEach((r) => {
      loc.add(r.userId); utc.add(r.userId);
    });
    dauByLocalDay.set(localDay(start), loc.size);
    dauByUtcDay.set(utcDay(start), utc.size);
  }
  console.log(`\n[dauTrend] reported vs raw-by-LOCAL-day vs raw-by-UTC-day (last 14 days, newest first):`);
  for (const label of reportedLabels.slice().reverse()) {
    const reported = home.dauTrend.find((d) => d.date === label);
    // local day map: find key equal to label
    const rawLocal = dauByLocalDay.get(label) ?? null;
    const rawUtc = dauByUtcDay.get(label) ?? null;
    const marker = reported && rawLocal !== null && reported.dau !== rawLocal ? " <-- MISMATCH vs local" : "";
    console.log(`  ${label}: reported=${reported?.dau}  rawLocal=${rawLocal}  rawUtc=${rawUtc}${marker}`);
  }

  // ---- D. Other dashboard functions ----
  console.log(`\n=== other dashboard functions (userId=${userId.slice(0, 8)}…) ===`);
  const radar = await getDashboardRadarData(userId);
  console.log("radar.actionSummary:", JSON.stringify(radar.actionSummary));
  console.log("radar.hotPosts:", radar.hotPosts.map((h) => `${h.id.slice(0, 8)}:score${h.hotScore}`).join(" "));
  const aff = await getDashboardAffiliationsData(userId);
  console.log("affiliations:", JSON.stringify(aff.summary), "links=", aff.links.length);
  const acquire = await getDashboardAcquireHandlesData(userId);
  console.log("acquireHandles:", JSON.stringify(acquire.summary));
  const hire = await getDashboardHireTalentData(userId);
  console.log("hireTalent:", JSON.stringify(hire.summary));
  const support = await getDashboardSupportData(userId);
  console.log("vipSupport:", JSON.stringify(support.summary));
  const billing = await getDashboardBillingData(userId);
  console.log("billing:", JSON.stringify(billing.summary));
  const settings = await getDashboardSettingsData(userId);
  console.log("settings:", JSON.stringify(settings.summary));

  // ---- E. TrendPill comparison sanity (what the 4 headline pills compare) ----
  console.log(`\n[TrendPill inputs on /dashboard]`);
  console.log(`  Card1 "Following":     current=${home.summary.totalUsers} (following) previous=${home.summary.totalPremiumUsers} (followers)`);
  console.log(`  Card2 "Followers":     current=${home.summary.totalPremiumUsers} (followers) previous=${home.summary.totalUsers} (following)`);
  console.log(`  Card3 "Posts/Replies": current=${home.summary.totalPosts} (posts) previous=${home.summary.totalReplies} (replies)`);
  console.log(`  Card4 "Week P/R":      current=${home.summary.weeklyNewUsers} (week replies) previous=${home.summary.weeklyNewPosts} (week posts)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("AUDIT FAILED:", e);
  process.exit(1);
});
