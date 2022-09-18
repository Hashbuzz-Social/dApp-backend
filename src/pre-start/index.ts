/**
 * Pre-start is where we want to place things that must run BEFORE the express server is started.
 * This is useful for environment variables, command-line arguments, and cron-jobs.
 */

import dotenv from "dotenv";
import { taskEveryMinute, taskEverySixDay } from "./cronJob";
// import tweeterApi from "@shared/twitterAPI";
// import { writeFileSync } from "fs";

(() => {
  // Setup command line options
  dotenv.config();
  taskEveryMinute.start();
  taskEverySixDay.start();
  // (async () => {
  //   const allLikedUsers = await tweeterApi.getAllUsersWhoLikedOnTweetId("1568884114308349952");
  //   const reTweetData = await tweeterApi.getAllRetweetOfTweetId("1568884114308349952");
  //   const QuotedTweets = await tweeterApi.getAllUsersWhoQuotedOnTweetId("1569953613073764352")
  //   writeFileSync("./logs/tweet-stats-likes-1568884114308349952.json", JSON.stringify(allLikedUsers), "utf8");
  //   writeFileSync("./logs/tweet-stats-retweets-1568884114308349952.json", JSON.stringify(reTweetData), "utf8");
  //   writeFileSync("./logs/tweet-stats-quotes-1569953613073764352.json", JSON.stringify(QuotedTweets), "utf8");
  // })();
})();
