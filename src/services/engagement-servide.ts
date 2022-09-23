import twitterAPI from "@shared/twitterAPI";
import prisma from "@shared/prisma";

export const updateRepliesToDB = async (id: number | bigint, tweet_Id: number | string) => {
  const [allReplies, allExistingReplyEngagements] = await Promise.all([
    await twitterAPI.getAllReplies(`${tweet_Id}`),
    await prisma.campaign_tweetengagements.findMany({
      where: {
        tweet_id: id.toString(),
        engagement_type: "Reply",
      },
      select: {
        user_id: true,
        tweet_id: true,
        engagement_type: true,
      },
    }),
  ]);
  const existingUserIds = allExistingReplyEngagements.map((d) => d.user_id);

  const formattedArray = allReplies.map((d) => ({ user_id: d.author_id!, tweet_id: id.toString(), engagement_type: "Reply" }));
  const filterResult = formattedArray.filter((d) => {
    const isExisting = existingUserIds.includes(d.user_id);
    return !isExisting;
  });
  if (filterResult)
    return await prisma.campaign_tweetengagements.createMany({
      data: [...filterResult],
      skipDuplicates: true,
    });
  else return false;
};
