import twitterCardService, { TwitterStats } from "@services/twitterCard-service";
import { getEngagementOnCard } from "@shared/twitterAPI";
import { calculateTotalSpent } from "@shared/functions";

const manageTwitterCardStatus = async () => {
  console.info("manageTwitterCardStatus::start");
  //? get all active cards from DB
  const allActiveCard = await twitterCardService.allActiveTwitterCard();

  //! looping through each card
  await Promise.all(
    allActiveCard.map(async (card) => {
      let total_spent = 0;
      const campaignStats: TwitterStats = {};
      // refactor card object
      const { tweet_id, retweet_reward, like_reward, quote_reward, id, name } = card;

      //? get Engagment Data on card. "like" , "Quote", "Retweet"
      const { like, quote, retweet } = await getEngagementOnCard(tweet_id ?? "");

      const _likeCount = like?.meta.result_count;
      const _qoteCount = quote?.meta.result_count;
      const _retweetCount = retweet?.meta.result_count;

      //?  get card count status from DB.
      const CurrCardStats = await twitterCardService.twitterCardStats(id);

      if (CurrCardStats) {
        //! compare counts with existing record and then update
        const { like_count, retweet_count, quote_count } = CurrCardStats;

        //!  if count changes update the data.

        if (like_count !== _likeCount) campaignStats.like_count = _likeCount;
        if (quote_count !== _qoteCount) campaignStats.quote_count = _qoteCount;
        if (retweet_count !== _retweetCount) campaignStats.retweet_count = _retweetCount;

        if (retweet_reward && like_reward && quote_reward) {
          total_spent = calculateTotalSpent(
            {
              like_count: _likeCount ?? 0,
              quote_count: _qoteCount ?? 0,
              retweet_count:_retweetCount ?? 0,
            },
            {
              retweet_reward,
              like_reward,
              quote_reward,
            }
          );
        } else {
          console.log(
            `Rewards basis for the campaign card with id ${id} and name:- ${
              name ?? ""
            } is not defined`
          );
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
          },
          id
        );
      }
    })
  );
};

export default {
  updateCardStatus: manageTwitterCardStatus,
} as const;
