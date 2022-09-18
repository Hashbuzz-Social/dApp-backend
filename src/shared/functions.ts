import logger from "jet-logger";
import { TwitterStats, RewardCatalog } from "@services/twitterCard-service";

/**
 * Print an error object if it's truthy. Useful for testing.
 *
 * @param err
 */
const pErr = (err?: Error): void => {
  if (!!err) {
    logger.err(err);
  }
};

/**
 * Get a random number between 1 and 1,000,000,000,000
 *
 * @returns
 */
const getRandomInt = (): number => {
  return Math.floor(Math.random() * 1_000_000_000_000);
};

/**
 * Calculate total budget spent for the a twitter campaign.
 *
 */ const calculateTotalSpent = (stats: Required<TwitterStats>, rewards: RewardCatalog): number => {
  const { like_count, quote_count, retweet_count, reply_count } = stats;
  const { like_reward, quote_reward, retweet_reward, reply_reward } = rewards;
  let totalSpentAmount = 0;
  totalSpentAmount = like_count * like_reward + retweet_count * retweet_reward + quote_count * quote_reward + reply_count * reply_reward;
  return totalSpentAmount;
};

export default {
  calculateTotalSpent,
  getRandomInt,
  pErr,
} as const;
