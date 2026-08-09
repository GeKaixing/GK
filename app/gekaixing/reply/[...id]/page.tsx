import PostRetreat from '@/components/gekaixing/PostRetreat'
import PostStore from '@/components/gekaixing/PostStore'
import PublishReply from '@/components/gekaixing/PublishReply'
import Reply from '@/components/gekaixing/Reply'
import { createClient } from '@/utils/supabase/server'
import { getPostById, getPostReplies } from '@/lib/feed/replies'

export default async function Page({ params }: { params: Promise<{ id: string[] }> }) {
  const { id } = await params;
  const postId = id[0];
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 直接查 Prisma（带超时保护），避免服务端自取 /api/reply 不带 cookie 导致 401
  const [post, replyPage] = await Promise.all([
    getPostById(postId, user?.id),
    getPostReplies(postId, user?.id),
  ]);

  return (
    <div className='space-y-4'>
      <PostRetreat></PostRetreat>
      <PostStore data={post ? [post] : []}></PostStore>
      <PublishReply
        postId={postId}
        replyId={postId}
        userId={user?.id}
        type={'reply'}
      ></PublishReply>
      <Reply
        replies={replyPage.data}
        nextCursor={replyPage.page.nextCursor}
        hasMore={replyPage.page.hasMore}
        feedQuery={{ scope: "post-replies", targetId: postId }}
      />
    </div >
  );
}
