import {
  campaign_twittercard,
  campaignstatus as CampaignStatus,
  user_user,
} from '@prisma/client';
import { decrypt } from '@shared/encryption';
import {
  addMinutesToTime,
  convertTinyHbarToHbar,
  formattedDateTime,
} from '@shared/helper';
import createPrismaClient from '@shared/prisma';
import twitterAPI from '@shared/twitterAPI';
import moment from 'moment';
import { TweetV2PostTweetResult } from 'twitter-api-v2';
import logger from 'jet-logger';
import { provideActiveContract } from './contract-service';
import { getConfig } from '@appConfig';
import { MediaService } from './media-service';

export interface TwitterStats {
  like_count?: number;
  retweet_count?: number;
  quote_count?: number;
  reply_count?: number;
}

export interface RewardCatalog {
  retweet_reward: number;
  like_reward: number;
  quote_reward: number;
  reply_reward: number;
}

export const allActiveTwitterCard = async () => {
  // console.info("allActiveTwitterCard::start");
  const prisma = await createPrismaClient();
  const allActiveCards = await prisma.campaign_twittercard.findMany({
    where: {
      card_status: CampaignStatus.CampaignRunning,
    },
  });
  return allActiveCards;
};

const twitterCardStats = async (cardId: bigint) => {
  // console.info("twitterCardStatus::Start");
  const prisma = await createPrismaClient();
  const cardStatus = await prisma.campaign_tweetstats.findUnique({
    where: {
      twitter_card_id: cardId,
    },
  });
  return cardStatus;
};

const updateTwitterCardStats = async (
  body: TwitterStats,
  cardId: bigint | number
) => {
  const { like_count, quote_count, reply_count, retweet_count } = body;

  const prisma = await createPrismaClient();
  const update = await prisma.campaign_tweetstats.upsert({
    where: { twitter_card_id: cardId },
    update: {
      like_count: like_count,
      quote_count: quote_count,
      reply_count: reply_count,
      retweet_count: retweet_count,
      last_update: new Date().toISOString(),
    },
    create: {
      like_count: like_count,
      quote_count: quote_count,
      reply_count: reply_count,
      retweet_count: retweet_count,
      twitter_card_id: cardId,
      last_update: new Date().toISOString(),
    },
  });
  return update.id;
};

const addNewCardStats = async (body: TwitterStats, cardId: bigint | number) => {
  // console.info("addNewCardStats::start::withData", JSON.stringify(body));

  const data: any = {};
  if (body.like_count) data['like_count'] = body.like_count;
  if (body.quote_count) data['quote_count'] = body.quote_count;
  if (body.retweet_count) data['retweet_count'] = body.retweet_count;

  const prisma = await createPrismaClient();
  const addNewStats = prisma.campaign_tweetstats.create({
    data: {
      ...data,
      twitter_card_id: cardId,
      last_update: new Date().toISOString(),
    },
  });

  return addNewStats;
};

const updateTotalSpentAmount = async (
  id: number | bigint,
  amount_spent: number
) => {
  const prisma = await createPrismaClient();
  const updateTotalSpentBudget = await prisma.campaign_twittercard.update({
    where: { id },
    data: {
      amount_spent,
    },
  });
  return updateTotalSpentBudget;
};

/**
 * @description putlish a tweet and thread
 */

interface PublishTweetParams {
  cardOwner: user_user;
  tweetText: string;
  isThread?: boolean;
  parentTweetId?: string;
  media?: string[];
}

const publishTweetORThread = async (params: PublishTweetParams) => {
  const { cardOwner, tweetText, isThread, parentTweetId, media } = params;
  const config = await getConfig();

  if (tweetText.length > 280) {
    throw new Error('Long tweet text. Max allowed is 280 char long.');
  }

  if (
    cardOwner.business_twitter_access_token &&
    cardOwner.business_twitter_access_token_secret
  ) {
    const userTwitter = await twitterAPI.tweeterApiForUser({
      accessToken: decrypt(
        cardOwner.business_twitter_access_token,
        config.encryptions.encryptionKey
      ),
      accessSecret: decrypt(
        cardOwner?.business_twitter_access_token_secret,
        config.encryptions.encryptionKey
      ),
    });

    let card: TweetV2PostTweetResult;
    let mediaIds: string[] = [];

    if (media && media.length > 0) {
      const mediaService = new MediaService();
      await mediaService.initialize();

      mediaIds = await Promise.all(
        media.map(async (mediKey) => {
          const mediFile = await mediaService.readFromS3(mediKey);
          const mediaId = await userTwitter.v1.uploadMedia(mediFile.buffer, {
            mimeType: mediFile.mimetype,
          });
          return mediaId;
        })
      );
    }

    const rwClient = userTwitter.readWrite;
    try {
      if (isThread && parentTweetId) {
        card = await rwClient.v2.reply(tweetText, parentTweetId);
      } else if (mediaIds.length > 0) {
        card = await rwClient.v2.tweet(tweetText, {
          media: { media_ids: mediaIds },
        });
      } else {
        card = await rwClient.v2.tweet(tweetText);
      }
      return card.data.id;
    } catch (error: any) {
      // Handle specific Twitter API errors
      if (
        error.code === 401 ||
        error.status === 401 ||
        (error.data && error.data.status === 401)
      ) {
        const authExpiredMsg =
          'TWITTER_AUTH_EXPIRED: Your 𝕏 account authentication has expired. ' +
          'Please reconnect your business 𝕏 account to continue publishing campaigns.';
        throw new Error(authExpiredMsg);
      } else if (error.code === 403 || error.status === 403) {
        const forbiddenMsg =
          'TWITTER_FORBIDDEN: Your 𝕏 account does not have permission to perform ' +
          'this action. Please check your account permissions.';
        throw new Error(forbiddenMsg);
      } else if (error.code === 429 || error.status === 429) {
        const rateLimitMsg =
          'TWITTER_RATE_LIMITED: 𝕏 API rate limit exceeded. ' +
          'Please wait a few minutes before trying again.';
        throw new Error(rateLimitMsg);
      } else if (
        error.message &&
        typeof error.message === 'string' &&
        error.message.includes('duplicate')
      ) {
        const duplicateMsg =
          'TWITTER_DUPLICATE: This tweet content has already been posted. ' +
          'Please modify your campaign text.';
        throw new Error(duplicateMsg);
      } else {
        // Log the full error for debugging
        logger.err(
          `Twitter API Error: ${JSON.stringify({
            code: error.code,
            status: error.status,
            message: error.message,
          })}`
        );
        const errorMsg: string =
          error.message && typeof error.message === 'string'
            ? error.message
            : 'Unknown Twitter API error';
        throw new Error(`Failed to publish tweet: ${errorMsg}`);
      }
    }
  }
  throw new Error('User does not have sufficient records.');
};

/**
 * @description publish first tweet
 * @returns string first tweet id to make threds
 */

const publistFirstTweet = async (
  card: campaign_twittercard,
  cardOwner: user_user
) => {
  const tweetText = `${card.tweet_text}`;
  if (tweetText) {
    const tweetId = publishTweetORThread({
      tweetText,
      cardOwner,
      media: card.media,
    });
    return tweetId;
  }
};

/**
 * @description Publish second tweet
 * @returns id secod thred tweet id;
 */

const publishSecondThread = async (
  card: campaign_twittercard,
  cardOwner: user_user,
  parentTweetId: string
): Promise<string> => {
  const {
    type: cardType,
    tweet_text,
    like_reward,
    quote_reward,
    retweet_reward,
    comment_reward,
    fungible_token_id,
    decimals,
  } = card;

  const formattedDate = formattedDateTime(moment().toISOString());
  const configs = await getConfig();
  const campaignDurationInMin = configs.app.defaultCampaignDuration;

  if (!tweet_text) throw new Error('Tweet text is missing.');
  if (!like_reward || !quote_reward || !retweet_reward || !comment_reward) {
    throw new Error('One or more reward values are missing.');
  }

  const formatRewards = (reward: number, factor: number) =>
    (reward / factor).toFixed(2);

  let tweetText: string;

  if (cardType === 'HBAR') {
    tweetText = `Promo initiated on ${formattedDate}. Interact with the primary tweet for the next ${campaignDurationInMin} min to earn rewards in HBAR: like ${convertTinyHbarToHbar(
      like_reward
    ).toFixed(2)}, repost ${convertTinyHbarToHbar(retweet_reward).toFixed(
      2
    )}, quote ${convertTinyHbarToHbar(quote_reward).toFixed(
      2
    )}, reply ${convertTinyHbarToHbar(comment_reward).toFixed(2)}.`;
  } else {
    const prisma = await createPrismaClient();
    const token = await prisma.whiteListedTokens.findUnique({
      where: { token_id: String(fungible_token_id) },
    });
    if (!token) throw new Error('Token not found.');

    const tokenSymbol = token.token_symbol ?? '';
    const factor = 10 ** Number(decimals);

    tweetText = `Promo initiated on ${formattedDate}. Interact with the primary tweet for the next ${campaignDurationInMin} min to earn rewards in ${tokenSymbol}: like ${formatRewards(
      like_reward,
      factor
    )}, repost ${formatRewards(retweet_reward, factor)}, quote ${formatRewards(
      quote_reward,
      factor
    )}, reply ${formatRewards(comment_reward, factor)}.`;
  }

  try {
    const tweetId = await publishTweetORThread({
      tweetText,
      cardOwner,
      isThread: true,
      parentTweetId,
    });

    return tweetId;
  } catch (error) {
    throw new Error(`Failed to publish tweet or thread: ${error.message}`);
  }
};

/**
 * @deprecated
 *@description Create twitter tweet if the card is in pending state and then update the status.
 */

const publishTwitter = async (cardId: number | bigint) => {
  const prisma = await createPrismaClient();
  const configs = await getConfig();
  const campaignDurationInMin = configs.app.defaultCampaignDuration;

  const [contractDetails, cardDetails] = await Promise.all([
    await provideActiveContract(),
    await prisma.campaign_twittercard.findUnique({
      where: { id: cardId },
      include: {
        user_user: {
          select: {
            twitter_access_token: true,
            twitter_access_token_secret: true,
            business_twitter_access_token: true,
            business_twitter_access_token_secret: true,
          },
        },
      },
    }),
  ]);

  const {
    id,
    tweet_text,
    user_user,
    like_reward,
    quote_reward,
    retweet_reward,
    comment_reward,
    type,
    media,
    fungible_token_id,
    decimals,
  } = cardDetails!;
  const contract_id = contractDetails?.contract_id;
  if (
    tweet_text &&
    user_user?.business_twitter_access_token &&
    user_user?.business_twitter_access_token_secret &&
    user_user?.twitter_access_token &&
    user_user?.twitter_access_token_secret &&
    contract_id &&
    like_reward &&
    quote_reward &&
    comment_reward &&
    retweet_reward
  ) {
    let threat1;
    if (media[0]) {
      threat1 = `${tweet_text} ${media[0]}`;
    } else {
      threat1 = `${tweet_text}`;
    }

    const token = await prisma.whiteListedTokens.findUnique({
      where: { token_id: String(fungible_token_id) },
    });
    //@ignore es-lint
    const currentDate = new Date();
    const formattedDate = formattedDateTime(currentDate.toISOString());

    const threat2Hbar = `Promo initiated on ${formattedDate}. Interact with the primary tweet for the next ${campaignDurationInMin} min to earn rewards in HBAR: like ${convertTinyHbarToHbar(
      like_reward
    ).toFixed(2)}, repost ${convertTinyHbarToHbar(retweet_reward).toFixed(
      2
    )}, quote ${convertTinyHbarToHbar(quote_reward).toFixed(
      2
    )}, reply ${convertTinyHbarToHbar(comment_reward).toFixed(2)}.`;

    const threat2Fungible = `Promo initiated on ${formattedDate}. IInteract with the primary tweet for the next ${campaignDurationInMin} min to earn rewards in ${
      token?.token_symbol ?? ''
    }: like ${(like_reward / 10 ** Number(decimals)).toFixed(2)}, repost ${(
      retweet_reward /
      10 ** Number(decimals)
    ).toFixed(2)}, quote ${(quote_reward / 10 ** Number(decimals)).toFixed(
      2
    )}, reply ${(comment_reward / 10 ** Number(decimals)).toFixed(2)}.`;

    const userTwitter = await twitterAPI.tweeterApiForUser({
      accessToken: decrypt(
        user_user?.business_twitter_access_token,
        configs.encryptions.encryptionKey
      ),
      accessSecret: decrypt(
        user_user?.business_twitter_access_token_secret,
        configs.encryptions.encryptionKey
      ),
    });

    try {
      const rwClient = userTwitter.readWrite;

      const card = await rwClient.v2.tweet(threat1);

      let reply;
      if (type === 'HBAR') {
        reply = await rwClient.v2.reply(threat2Hbar, card.data.id);
      } else if (type === 'FUNGIBLE') {
        reply = await rwClient.v2.reply(threat2Fungible, card.data.id);
      }
      const tweetId = card.data.id;
      const lastThreadTweetId = reply?.data.id;

      //Add TweetId to the DB
      await prisma.campaign_twittercard.update({
        where: { id },
        data: {
          tweet_id: tweetId,
          last_thread_tweet_id: lastThreadTweetId,
          card_status: CampaignStatus.CampaignRunning,
          campaign_start_time: currentDate.toISOString(),
          campaign_close_time: addMinutesToTime(
            currentDate.toISOString(),
            campaignDurationInMin ?? 15
          ),
        },
      });
      return tweetId;
    } catch (err) {
      console.log(err);
      throw Error('Something wrong with tweet text.');
    }
  } else {
    throw Error("User's brand handle not found");
  }
};

const getAllTwitterCardByStatus = async (status: CampaignStatus) => {
  const prisma = await createPrismaClient();
  const data = await prisma.campaign_twittercard.findMany({
    where: {
      card_status: status,
    },
    include: {
      user_user: {
        select: {
          business_twitter_handle: true,
          personal_twitter_handle: true,
          available_budget: true,
          hedera_wallet_id: true,
        },
      },
    },
    orderBy: {
      id: 'desc',
    },
  });

  return data;
};

const getAllTwitterCardPendingCards = async () => {
  const prisma = await createPrismaClient();
  const data = await prisma.campaign_twittercard.findMany({
    where: {
      approve: false,
      isRejected: null,
    },
  });

  return data;
};

const updateStatus = async (id: number, status: boolean) => {
  const prisma = await createPrismaClient();
  const data = await prisma.campaign_twittercard.findUnique({
    where: {
      id,
    },
  });

  if (data?.card_status === CampaignStatus.ApprovalPending) {
    if (status === true) {
      const data = await prisma.campaign_twittercard.update({
        where: {
          id,
        },
        data: {
          approve: true,
          isRejected: false,
          card_status: CampaignStatus.CampaignApproved,
        },
      });

      return data;
    } else if (status === false) {
      const data = await prisma.campaign_twittercard.update({
        where: {
          id,
        },
        data: {
          isRejected: true,
          card_status: CampaignStatus.CampaignDeclined,
        },
      });

      return data;
    }
  }
};

export default {
  allActiveTwitterCard,
  twitterCardStats,
  updateTwitterCardStats,
  addNewCardStats,
  updateTotalSpentAmount,
  publishTwitter,
  getAllTwitterCardByStatus,
  getAllTwitterCardPendingCards,
  updateStatus,
  publistFirstTweet,
  publishSecondThread,
  publishTweetORThread,
} as const;
