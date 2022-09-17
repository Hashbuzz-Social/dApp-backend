import twitterCardService, { TwitterStats } from "@services/twitterCard-service";
import twitterAPI from "@shared/twitterAPI";
import logger from "jet-logger";
import functions from "@shared/functions";

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
        const { comment_reward, retweet_reward, like_reward, quote_reward, id, name } = card;

        //? get Engagment Data on card. "like" , "Quote", "Retweet" from the twitterAPI.
        const {
          like_count: _likeCount,
          reply_count: _replyCount,
          retweet_count: _retweetCount,
          quote_count: _qoteCount,
        } = publicMetrics[activeCardsIds[index]];

        //?  get card count status of  "like" , "Quote", "Retweet" from DB(means exiting records).
        const CurrCardStats = await twitterCardService.twitterCardStats(id);

        if (CurrCardStats) {
          //! compare counts with existing record and then update
          const { like_count, retweet_count, quote_count, reply_count } = CurrCardStats;

          //!  if count changes update the data.
          if (like_count && like_count !== _likeCount) campaignStats.like_count = _likeCount;
          if (quote_count && quote_count !== _qoteCount) campaignStats.quote_count = _qoteCount;
          if (retweet_count && retweet_count !== _retweetCount) campaignStats.retweet_count = _retweetCount;
          if (reply_count && reply_count !== _replyCount) campaignStats.reply_count = _replyCount;

          if (retweet_reward && like_reward && quote_reward && comment_reward) {
            total_spent = functions.calculateTotalSpent(
              {
                like_count: _likeCount ?? 0,
                quote_count: _qoteCount ?? 0,
                retweet_count: _retweetCount ?? 0,
                reply_count: _replyCount ?? 0,
              },
              {
                retweet_reward,
                like_reward,
                quote_reward,
                reply_reward: comment_reward,
              }
            );
            //convert total to tiny hbar
            total_spent = Math.round(total_spent * Math.pow(10,8));

            logger.info(`Total amount sped for the campaign card - ${id} is:::- ${total_spent}`);
          } else {
            logger.warn(`Rewards basis for the campaign card with id ${id} and name:- ${name ?? ""} is not defined`);
          }

          //? update stats to DB
          await Promise.all([
            await twitterCardService.updateTwitterCardStats(campaignStats, id),
            await twitterCardService.updateTotalSpentAmount(id, total_spent),
          ]);
        } else {
          //!! if not available in db then update the DB by adding new record.
          await twitterCardService.addNewCardStats(
            {
              like_count: _likeCount,
              retweet_count: _retweetCount,
              quote_count: _qoteCount,
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

export default {
  updateCardStatus: manageTwitterCardStatus,
} as const;
