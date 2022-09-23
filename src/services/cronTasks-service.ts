import { updateRepliesToDB } from "@services/engagement-servide";
import twitterCardService, { TwitterStats } from "@services/twitterCard-service";
import functions from "@shared/functions";
import twitterAPI from "@shared/twitterAPI";
import logger from "jet-logger";
import moment from "moment";
import { completeCampaignOperation, perFormCampaignExpiryOperation } from "@services/campaign-service";
import prisma from "@shared/prisma";
import { scheduleJob } from "node-schedule";

/****
 * @description This function is dealing with checking for tweet stats (likes , comments , quote , replies) counts.
 * => Check for running campaigns in database.
 * => create array od tweet_ids of the campaign
 * => loop through the array and check for the stats with twitter api.
 * => calculating total spent amount based on the tweet stats
 * => if total spent amount is greater than total campaign budget then perform close campaign operation.
 * ===================================||
 */
const manageTwitterCardStatus = async () => {
  logger.info("manageTwitterCardStatus::start");
  //? get all active cards from DB
  const allActiveCard = await twitterCardService.allActiveTwitterCard();
  const activeCardsIds: string[] = [];

  allActiveCard.forEach((d) => {
    if (d.tweet_id) activeCardsIds.push(d.tweet_id);
  });

  if (allActiveCard.length > 0) {
    const publicMetrics = await twitterAPI.getPublicMetrics(activeCardsIds);

    //! looping through each card
    await Promise.all(
      allActiveCard.map(async (card, index) => {
        let total_spent = 0;
        const campaignStats: TwitterStats = {};
        // refactor card object
        const { comment_reward, retweet_reward, like_reward, quote_reward, id, name, campaign_budget } = card;

        //? get Engagment Data on card. "like" , "Quote", "Retweet" from the twitterAPI.
        const {
          like_count: _likeCount,
          reply_count: _replyCount,
          retweet_count: _retweetCount,
          quote_count: _quoteCount,
        } = publicMetrics[activeCardsIds[index]];

        //?  get card count status of  "like" , "Quote", "Retweet" from DB(means exiting records).
        const CurrCardStats = await twitterCardService.twitterCardStats(id);

        if (CurrCardStats) {
          //! compare counts with existing record and then update
          const { like_count, retweet_count, quote_count, reply_count } = CurrCardStats;

          //!  if count changes update the data.
          if (like_count && like_count !== _likeCount) campaignStats.like_count = _likeCount;
          if (quote_count && quote_count !== _quoteCount) campaignStats.quote_count = _quoteCount;
          if (retweet_count && retweet_count !== _retweetCount) campaignStats.retweet_count = _retweetCount;
          if (reply_count && reply_count !== _replyCount) campaignStats.reply_count = _replyCount;

          if (retweet_reward && like_reward && quote_reward && comment_reward) {
            total_spent = functions.calculateTotalSpent(
              {
                like_count: _likeCount,
                quote_count: _quoteCount,
                retweet_count: _retweetCount,
                reply_count: _replyCount,
              },
              {
                retweet_reward,
                like_reward,
                quote_reward,
                reply_reward: comment_reward,
              }
            );
            //convert total to tiny hbar
            total_spent = Math.round(total_spent * Math.pow(10, 8));

            logger.info(`Total amount sped for the campaign card - ${id} is:::- ${total_spent}`);
          } else {
            logger.warn(`Rewards basis for the campaign card with id ${id} and name:- ${name ?? ""} is not defined`);
          }

          //? update stats to DB
          await Promise.all([
            await twitterCardService.updateTwitterCardStats(campaignStats, id),
            await twitterCardService.updateTotalSpentAmount(id, total_spent),
          ]);

          //!! Check budget of the champaign compare it with total spent  amount::4
          //? First convert campaignBudget to tinyHabr;
          const tiny_campaign_budget = Math.round((campaign_budget ?? 0) * Math.pow(10, 8));

          if (total_spent > tiny_campaign_budget) {
            console.log(`total_spent: ${total_spent} || tiny_campaign_budget::${tiny_campaign_budget}`);
            logger.info(`Campaign with Name ${name ?? ""} Has no more budget available close it`);
            completeCampaignOperation(card);
          }
        } else {
          //!! if not available in db then update the DB by adding new record.
          await twitterCardService.addNewCardStats(
            {
              like_count: _likeCount,
              retweet_count: _retweetCount,
              quote_count: _quoteCount,
              reply_count: _replyCount,
            },
            id
          );
        }
      })
    );
  } else {
    logger.info("Thee is no active card found in DB");
  }
};

/*****
 * @description This function will check replies in tweeter and then will update the engagement DB module.
 * 1. Get all active card.
 * 2. check from the comments on the the active card.
 * 3. formate data remove duplicate entries from the data.
 */
const checkForRepliesAndUpdateEngagementsData = async () => {
  logger.info("Replies check:::start");
  //!! 5 days of threshold
  const thresholdSeconds = 4 * 24 * 60 * 60;

  //? get all active cards from DB
  const allActiveCard = await twitterCardService.allActiveTwitterCard();

  //!!loop through al active card and check for comments on tweeter.
  await Promise.all(
    allActiveCard.map(async (card, index) => {
      const { last_reply_checkedAt } = card;
      //! time diff in seconds
      const timeDiffInSeconds = moment().unix() - moment(last_reply_checkedAt).unix();
      if (card.tweet_id && timeDiffInSeconds > thresholdSeconds) {
        //? Log card details if we are fetching comments for this card.
        logger.info(`Fetching comments for the card id : ${card.id} with name ${card?.name ?? ""}`);

        //!! fetch comments from tweeter and update to DB engagements records.
        await updateRepliesToDB(card.id, card.tweet_id);
      }
    })
  );
};

const scheduleExpiryTasks = async () => {
  const getCompletedTask = await prisma.campaign_twittercard.findMany({
    where: {
      card_status: "Completed",
      campaign_expiry: {
        gte: new Date(),
      },
    },
  });
  getCompletedTask.map((card) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const date = new Date(card.campaign_expiry!);
    scheduleJob(date, function () {
      const cardId = card.id;
      perFormCampaignExpiryOperation(cardId);
    });
  });
};

export default {
  updateCardStatus: manageTwitterCardStatus,
  checkForRepliesAndUpdateEngagementsData,
  scheduleExpiryTasks
} as const;
