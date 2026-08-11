import type { ReactElement } from "react";
import { getTranslations } from "next-intl/server";
import ArrowLeftBack from "@/components/gekaixing/ArrowLeftBack";
import AdCampaignForm, { type AdCampaignPost } from "@/components/gekaixing/AdCampaignForm";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewAdPage({
  searchParams,
}: {
  searchParams: Promise<{ postId?: string }>;
}): Promise<ReactElement> {
  const t = await getTranslations("ImitationX.Ads");
  const { postId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let posts: AdCampaignPost[] = [];
  if (user?.id) {
    const rows = await prisma.post.findMany({
      where: { authorId: user.id, parentId: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, content: true, createdAt: true },
    });
    posts = rows.map((post) => ({
      id: post.id,
      content: post.content,
      createdAt: post.createdAt.toISOString(),
    }));
  }

  return (
    <div>
      <ArrowLeftBack name={t("createNew")} href="/gekaixing/ads" />
      <AdCampaignForm posts={posts} initialPostId={postId} />
    </div>
  );
}
