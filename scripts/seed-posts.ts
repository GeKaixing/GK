/**
 * Seed 1,000 test posts into Supabase (test DB) with varied media:
 *   video / image / image+text / long text / short text / video+image
 *
 * Run: npx tsx scripts/seed-posts.ts
 *
 * Creates 3 test users (idempotent upsert by email) and distributes the
 * posts across them. Content uses the app's media conventions:
 *   - images: `<img src=...>` inside content HTML (rendered via dangerouslySetInnerHTML)
 *   - video:  either `videoUrl` (YouTube embed iframe) or a `<video src=mp4>`
 *             node in content (HTML5, reachable from CN/Vercel)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.development.local" });

const SHORT_TEXTS = [
  "今天天气真好，出来走走。",
  "刚看完一本书，收获很多。",
  "周末去爬山了，风景太棒了！",
  "推荐一部好电影给大家。",
  "咖啡续命的一天。",
  "分享一个实用的生活小技巧。",
  "学会新技能了，开心。",
  "深夜食堂打卡。",
  "早起跑步打卡第 30 天。",
  "新买的耳机到了，音质不错。",
  "今天工作很顺利。",
  "和朋友聚餐，聊得很开心。",
  "读到一句很有感触的话。",
  "城市夜景随手拍。",
  "第一次尝试做菜，竟然成功了。",
  "今天学到了一个冷知识。",
  "周末天气正好，适合出门。",
  "又解锁了一家宝藏小店。",
  "坚持读书的第 100 天。",
  "窗外下雨了，适合听音乐。",
];

const LONG_PARAGRAPHS = [
  "今天想跟大家聊聊关于坚持这件事。很多人觉得坚持很难，其实难的不是坚持本身，而是我们总在等待一个「完美的开始」。",
  "最近我重新思考了时间管理的问题。把任务按重要性和紧急性划分，优先处理那些重要但不紧急的事情，长期来看效率会高很多。",
  "在信息爆炸的时代，专注力变成了最稀缺的资源。我试着每天固定一段时间放下手机，只做一件事，感受真的很不一样。",
  "关于学习，我的经验是：先搭框架，再填细节。不要一上来就钻牛角尖，而是先对整个领域有个大致认识，再逐步深入。",
  "成长往往发生在舒适区之外。那些让你不舒服的尝试，最后都会变成你的底气。",
  "运动带给我的不只是身体的变化，还有情绪的稳定。每次压力大的时候，去跑个五公里，回来整个人都会轻松很多。",
  "写作是最好的思考方式。把想法写下来，你才会发现逻辑的漏洞在哪里。",
  "生活不需要太复杂，简单一点，反而更容易坚持。好的习惯，都是从一个小的改变开始的。",
  "最近在读一本关于心理学的书，里面讲到一个观点：我们对世界的解读，往往比世界本身更重要。",
  "休息也是一种生产力。不要觉得停下来就是浪费时间，大脑需要休息才能更好地运转。",
];

const IMAGE_BASE = "https://picsum.photos/seed";
const VIDEO_BASE = "https://storage.googleapis.com/gtv-videos-bucket/sample";
const VIDEO_FILES = [
  "BigBuckBunny",
  "ElephantsDream",
  "ForBiggerBlazes",
  "ForBiggerEscapes",
  "ForBiggerFun",
  "ForBiggerJoyrides",
  "ForBiggerMeltdowns",
  "Sintel",
  "SubaruOutbackOnStreetAndDirt",
  "TearsOfSteel",
];
const YOUTUBE_IDS = [
  "aqz-KE-bpKQ", // Big Buck Bunny
  "y6120QOlsfU", // Elephants Dream
  "eRsGyueVLvQ", // Sintel
  "R6MlUcmOul8", // Tears of Steel
  "r2_-2TNZQH8", // For Bigger Blazes
];

const AUTHOR_SEEDS = [
  { email: "seed.author.a@example.com", userid: "seed_author_a", name: "种子作者A", avatar: `${IMAGE_BASE}/avatarA/200/200` },
  { email: "seed.author.b@example.com", userid: "seed_author_b", name: "种子作者B", avatar: `${IMAGE_BASE}/avatarB/200/200` },
  { email: "seed.author.c@example.com", userid: "seed_author_c", name: "种子作者C", avatar: `${IMAGE_BASE}/avatarC/200/200` },
];

const pick = <T,>(arr: T[], i: number): T => arr[i % arr.length];
const img = (seed: number) =>
  `<img src="${IMAGE_BASE}/${seed}/800/600" style="width:100%;border-radius:12px;margin:0.5rem 0" alt="测试图片"/>`;
const videoNode = (seed: number) =>
  `<video controls preload="none" style="width:100%;border-radius:12px;margin:0.5rem 0"><source src="${VIDEO_BASE}/${pick(VIDEO_FILES, seed)}.mp4" type="video/mp4"/></video>`;
const longText = (seed: number) =>
  Array.from({ length: 5 + (seed % 5) }, (_, p) => pick(LONG_PARAGRAPHS, seed + p * 3)).join("\n\n");

type ContentType =
  | "video" // videoUrl (YouTube embed) OR <video> in content
  | "image" // <img> only
  | "imageText" // <img> + paragraphs
  | "long" // many paragraphs
  | "short" // 1-2 sentences
  | "videoImage"; // <video> + <img>

function buildPost(index: number, authorId: string) {
  const type = TYPES[index % TYPES.length];
  const createdAt = new Date(Date.now() - Math.floor(Math.random() * 5 * 24 * 60 * 60 * 1000));

  switch (type) {
    case "video": {
      // 40% videoUrl (YouTube iframe), 60% <video> mp4 in content (CN-reachable)
      if (index % 5 < 2) {
        return {
          authorId,
          videoUrl: `https://www.youtube.com/embed/${pick(YOUTUBE_IDS, index)}`,
          content: `<p>${pick(SHORT_TEXTS, index)}</p><p>这是一个测试视频帖（YouTube 嵌入）。</p>`,
          createdAt,
        };
      }
      return {
        authorId,
        content: `<p>${pick(SHORT_TEXTS, index)}</p>${videoNode(index)}`,
        createdAt,
      };
    }
    case "image":
      return { authorId, content: img(index), createdAt };
    case "imageText":
      return {
        authorId,
        content: `${img(index)}\n\n${longText(index)}`,
        createdAt,
      };
    case "long":
      return { authorId, content: longText(index), createdAt };
    case "short":
      return { authorId, content: `<p>${pick(SHORT_TEXTS, index)}</p>`, createdAt };
    case "videoImage":
      return {
        authorId,
        content: `<p>${pick(SHORT_TEXTS, index)}</p>${videoNode(index)}${img(index + 1000)}`,
        createdAt,
      };
  }
}

const TYPES: ContentType[] = ["video", "image", "imageText", "long", "short", "videoImage"];

async function main() {
  const { prisma } = await import("@/lib/prisma");

  // 1. Ensure test users
  const authorIds: string[] = [];
  for (const seed of AUTHOR_SEEDS) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: { name: seed.name, avatar: seed.avatar },
      create: { email: seed.email, userid: seed.userid, name: seed.name, avatar: seed.avatar },
    });
    authorIds.push(user.id);
    console.log(`✔ user ${seed.email} → ${user.id}`);
  }

  // 2. Build 1000 posts
  const TOTAL = 1000;
  const posts = Array.from({ length: TOTAL }, (_, i) =>
    buildPost(i, authorIds[i % authorIds.length])
  );

  // 3. Insert (batched)
  const batchSize = 200;
  let inserted = 0;
  for (let start = 0; start < posts.length; start += batchSize) {
    const batch = posts.slice(start, start + batchSize);
    const result = await prisma.post.createMany({ data: batch, skipDuplicates: true });
    inserted += result.count;
  }

  console.log(`\nInserted ${inserted} posts.`);
  const typeCounts = await prisma.$queryRaw<{ type: string; count: bigint }[]>`
    SELECT
      CASE
        WHEN "videoUrl" IS NOT NULL THEN 'video(yt)'
        WHEN content LIKE '%<video%' AND content LIKE '%<img%' THEN 'video+image'
        WHEN content LIKE '%<img%' THEN 'image-ish'
        WHEN content LIKE '%<video%' THEN 'video(mp4)'
        WHEN length(content) > 400 THEN 'long'
        ELSE 'short'
      END AS type,
      COUNT(*)::int AS count
    FROM "Post"
    WHERE "authorId" IN (${authorIds[0]}, ${authorIds[1]}, ${authorIds[2]})
    GROUP BY type
    ORDER BY type;
  `;
  for (const row of typeCounts) {
    console.log(`  ${row.type}: ${row.count}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
