/**
 * Verify the recommendation engine stages against the test DB.
 * Seeds a "viewer" user with follows + likes (and a 4th author + a similar
 * user), then calls each stage helper directly and prints what they produce.
 *
 * Run: npx tsx scripts/verify-recommend.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.development.local" });

const VIEWER_EMAIL = "seed.viewer@example.com";

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const recommend = await import("@/lib/feed/recommend");

  // --- authors ---
  const authors = await prisma.user.findMany({
    where: { email: { in: ["seed.author.a@example.com", "seed.author.b@example.com", "seed.author.c@example.com"] } },
  });
  const [a, b, c] = authors;
  if (!a || !b || !c) throw new Error("seed authors missing — run scripts/seed-posts.ts first");

  // 4th author (NOT followed by the viewer → out-of-network source)
  const d = await prisma.user.upsert({
    where: { email: "seed.author.d@example.com" },
    update: {},
    create: { email: "seed.author.d@example.com", userid: "seed_author_d", name: "种子作者D", avatar: "https://picsum.photos/seed/avatarD/200/200" },
  });
  if ((await prisma.post.count({ where: { authorId: d.id } })) === 0) {
    await prisma.post.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        authorId: d.id,
        content: `<p>圈外作者D的帖子 ${i} —— 关于人工智能和机器学习的最新进展与讨论。</p>`,
        createdAt: new Date(Date.now() - i * 3600_000),
      })),
    });
  }

  // --- viewer ---
  const viewer = await prisma.user.upsert({
    where: { email: VIEWER_EMAIL },
    update: {},
    create: { email: VIEWER_EMAIL, userid: "seed_viewer", name: "浏览者", avatar: "https://picsum.photos/seed/viewer/200/200" },
  });
  const viewerId = viewer.id;

  // viewer follows A,B,C
  await prisma.follow.createMany({
    data: [a.id, b.id, c.id].map((followingId) => ({
      followerId: viewerId,
      followingId,
      status: "FOLLOWING",
    })),
    skipDuplicates: true,
  });

  // A,B,C like some of D's posts → network-engagement candidates
  const dPosts = await prisma.post.findMany({ where: { authorId: d.id }, take: 9, select: { id: true } });
  for (const [i, post] of dPosts.entries()) {
    const liker = [a.id, b.id, c.id][i % 3];
    await prisma.like.createMany({ data: [{ userId: liker, postId: post.id }], skipDuplicates: true });
  }

  // viewer likes ~6 posts + POST_LIKE UserActions → content profile + behavior boost
  const likedPosts = await prisma.post.findMany({ where: { authorId: { in: [d.id] } }, take: 6, select: { id: true, authorId: true } });
  for (const post of likedPosts) {
    await prisma.like.createMany({ data: [{ userId: viewerId, postId: post.id }], skipDuplicates: true });
    await prisma.userAction.create({
      data: {
        userId: viewerId,
        actionType: "POST_LIKE",
        targetPostId: post.id,
        targetAuthorId: post.authorId,
      },
    });
  }

  const followingIds = [a.id, b.id, c.id];
  const followingSet = new Set(followingIds);

  // --- run each stage ---
  console.log("\n=== Stage 1a: network engagement (posts my followed liked, not by them) ===");
  const net = await recommend.getNetworkEngagementCandidates(followingIds, followingSet);
  console.log(`  candidates: ${net.length}  (expect D's posts ≈ ${dPosts.length})`);

  console.log("\n=== Stage 1b: similar users ===");
  const similar = await recommend.getSimilarUserCandidates(viewerId, followingIds, followingSet);
  console.log(`  candidates: ${similar.length}`);

  console.log("\n=== Stage 2: content personalization ===");
  const profile = await recommend.getContentProfile(viewerId);
  console.log(`  profile tokens: ${profile.size}`);
  const sim = recommend.contentSimilarity(profile, `<p>人工智能与机器学习的最新进展</p>`);
  console.log(`  similarity(ai post): ${sim.toFixed(2)}`);
  const simOther = recommend.contentSimilarity(profile, `<p>今天天气很好去爬山</p>`);
  console.log(`  similarity(unrelated): ${simOther.toFixed(2)}`);

  console.log("\n=== Stage 3: author quality ===");
  const quality = await recommend.getAuthorQualityScores([a.id, b.id, c.id, d.id]);
  quality.forEach((q, id) => console.log(`  ${id.slice(0, 8)}: ${q.toFixed(2)}`));

  console.log("\n=== Stage 4: diversity rerank ===");
  const scored = [
    ...[a.id, a.id, a.id, a.id, b.id, c.id].map((authorId, i) => ({
      id: `p${i}`, authorId, createdAt: new Date(), likeCount: 0, replyCount: 0, shareCount: 0,
      isInNetwork: true, score: 100 - i,
    })),
    ...[d.id, d.id, d.id].map((authorId, i) => ({
      id: `o${i}`, authorId, createdAt: new Date(), likeCount: 0, replyCount: 0, shareCount: 0,
      isInNetwork: false, score: 90 - i,
    })),
  ];
  const reranked = recommend.rerankWithDiversity(scored);
  console.log(`  kept: ${reranked.length} / ${scored.length}  authors: ${reranked.map((r) => r.authorId.slice(0, 8)).join(",")}`);

  console.log("\n=== Stage 5: exploration slots ===");
  const explored = await recommend.addExplorationSlots(
    reranked.map((r) => ({ ...r, likeCount: 0, replyCount: 0, shareCount: 0 })),
    new Set(followingIds)
  );
  console.log(`  after exploration: ${explored.length} (may include fresh D posts)`);

  await prisma.$disconnect();
  console.log("\n✓ all stages ran without error");
}

main().catch((e) => {
  console.error("verify failed:", e);
  process.exit(1);
});
