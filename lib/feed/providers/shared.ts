import { prisma } from "@/lib/prisma";

/** Candidate-pool size limits shared by the built-in providers. */
export const FOLLOWING_CANDIDATE_LIMIT = 400;
export const HOT_CANDIDATE_LIMIT = 300;
export const RECENT_CANDIDATE_LIMIT = 300;

/** The viewer's followed author ids (the follow graph), as a Set. */
export async function getFollowingAuthorSet(userId: string): Promise<Set<string>> {
  const follows = await prisma.follow.findMany({
    where: {
      followerId: userId,
      status: "FOLLOWING",
    },
    select: {
      followingId: true,
    },
  });

  return new Set<string>(follows.map((item) => item.followingId));
}
