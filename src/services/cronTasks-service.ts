import { completeCampaignOperation, perFormCampaignExpiryOperation } from "@services/campaign-service";
import { campaignstatus as CampaignStatus } from "@prisma/client"
import { updateAllEngagementsForCard, updateRepliesToDB } from "@services/engagement-servide";
import twitterCardService, { TwitterStats } from "@services/twitterCard-service";
import functions from "@shared/functions";
import prisma from "@shared/prisma";
import logger from "jet-logger";
import moment from "moment";
import { scheduleJob } from "node-schedule";

/**
 * @description Manage Twitter card status by checking tweet stats and updating the campaign status accordingly.
 */
const manageTwitterCardStatus = async () => {
  const allActiveCards = await twitterCardService.allActiveTwitterCard();
  const activeCardIds = allActiveCards.map(card => card.tweet_id).filter(Boolean);

  if (!allActiveCards.length) {
    logger.info("No active cards found in DB");
    return;
  }

  await Promise.all(allActiveCards.map(async (card) => {
    const { comment_reward, retweet_reward, like_reward, quote_reward, id, name, campaign_budget } = card;
    const publicMetrics = await prisma.campaign_tweetstats.findUnique({ where: { twitter_card_id: id } });

    if (!publicMetrics || !(retweet_reward && like_reward && quote_reward && comment_reward)) {
      logger.warn(`Rewards basis for campaign card with id ${id} and name ${name ?? ""} is not defined or public metrics not found.`);
      return;
    }

    const totalSpent = Math.round(
      functions.calculateTotalSpent(
        {
          like_count: Number(publicMetrics.like_count),
          quote_count: Number(publicMetrics.quote_count),
          retweet_count: Number(publicMetrics.retweet_count),
          reply_count: Number(publicMetrics.reply_count),
        },
        {
          retweet_reward,
          like_reward,
          quote_reward,
          reply_reward: comment_reward,
        }
      )
    );

    console.log(`Total amount spent for the campaign card - ${id} is: ${totalSpent}`);

    await Promise.all([
      twitterCardService.updateTotalSpentAmount(id, totalSpent),
    ]);

    const tinyCampaignBudget = Math.round((campaign_budget ?? 0) * Math.pow(10, 8));

    if (totalSpent > tinyCampaignBudget) {
      logger.info(`Campaign with Name ${name ?? ""} has no more budget available, closing it.`);
      completeCampaignOperation(card);
    }
  }));
};

/**
 * @description Check for replies on Twitter and update the engagement DB module.
 */
const checkForRepliesAndUpdateEngagementsData = async () => {
  try {
    const thresholdSeconds = 60;
    const allActiveCards = await twitterCardService.allActiveTwitterCard();

    await Promise.all(allActiveCards.map(async (card) => {
      const { last_reply_checkedAt, tweet_id, id } = card;
      if (!tweet_id) return;

      const timeDiffInSeconds = moment().unix() - moment(last_reply_checkedAt).unix();
      if (timeDiffInSeconds <= thresholdSeconds) return;

      await updateRepliesToDB(id, tweet_id);
      await updateAllEngagementsForCard(id);
    }));
  } catch (err) {
    console.log(err);
  }
};

const scheduleExpiryTasks = async () => {
  const completedTasks = await prisma.campaign_twittercard.findMany({
    where: {
      card_status: CampaignStatus.RewardDistributionInProgress,
      campaign_expiry: {
        lt: new Date().toISOString(),
      },
    },
  });

  completedTasks.forEach(card => {
    const expiryDate = new Date(card.campaign_expiry!);
    scheduleJob(expiryDate, () => perFormCampaignExpiryOperation(card.id, card.contract_id as string));
  });
};

const autoCampaignClose = async () => {
  const runningTasks = await prisma.campaign_twittercard.findMany({ where: { card_status: CampaignStatus.CampaignRunning } });

  await Promise.all(runningTasks.map(async (task) => {
    if ((task.campaign_budget ?? 0) <= (task.amount_spent ?? 0)) {
      await completeCampaignOperation(task);
    }
    if (task.campaign_close_time && new Date(task.campaign_close_time) < new Date()) {
      await completeCampaignOperation(task);
    }
  }));
};

const updateQueueStatus = async (id: bigint) => {
  return await prisma.campaign_twittercard.update({
    where: { id },
    data: { is_added_to_queue: true },
  });
};

const checkCampaignCloseTime = async () => {
  const tasks = await prisma.campaign_twittercard.findMany({
    where: {
      card_status: CampaignStatus.CampaignRunning,
      is_added_to_queue: false,
      campaign_close_time: { gte: new Date() },
    },
  });

  await Promise.all(tasks.map(async (card) => {
    const closeTime = new Date(card.campaign_close_time!);
    await updateQueueStatus(card.id);
    scheduleJob(closeTime, () => completeCampaignOperation(card));
  }));
};

const checkPreviousCampaignCloseTime = async () => {
  logger.info("Checking backlog campaigns");
  const now = new Date();

  const campaigns = await prisma.campaign_twittercard.findMany({
    where: {
      OR: [
        { card_status: CampaignStatus.CampaignRunning, campaign_close_time: { lt: now } },
        { card_status: CampaignStatus.RewardDistributionInProgress, campaign_expiry: { lt: now } },
      ],
    },
  });

  if (!campaigns.length) {
    const message = "No active campaigns found";
    logger.info(message);
    console.info(message);
    return false;
  }

  const message = `Total active campaigns: ${campaigns.length}`;
  logger.info(message);
  console.info(message);

  await Promise.all(campaigns.map(async (campaign) => {
    if (campaign.card_status === CampaignStatus.CampaignRunning) {
      await completeCampaignOperation(campaign);
    } else if (campaign.contract_id) {
      await perFormCampaignExpiryOperation(campaign.id, campaign.contract_id);
    }
  }));
};

export default {
  updateCardStatus: manageTwitterCardStatus,
  checkForRepliesAndUpdateEngagementsData,
  scheduleExpiryTasks,
  autoCampaignClose,
  checkCampaignCloseTime,
  checkPreviousCampaignCloseTime,
} as const;
