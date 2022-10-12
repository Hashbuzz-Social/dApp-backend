
import { taskAtEveryMidNight, taskOnEvery30Seconds } from "./cronJob";
import cronTasksService from "@services/cronTasks-service";

(() => {
  taskAtEveryMidNight.start();
  taskOnEvery30Seconds.start();
  cronTasksService.scheduleExpiryTasks();

  //reply tasks
  // (async () => {
    // await cronService.scheduleExpiryTasks();
    // await cronService.checkForRepliesAndUpdateEngagementsData()
    //   const allLikedUsers = await tweeterApi.getAllUsersWhoLikedOnTweetId("1568884114308349952");
    //   const reTweetData = await tweeterApi.getAllRetweetOfTweetId("1568884114308349952");
      // const QuotedTweets = await twitterAPI.getAllUsersWhoQuotedOnTweetId("1569953613073764352")
    // const getAllReplies = await tweeterApi.getAllReplies("1571866729558724609");
    // writeFileSync("./logs/tweet-stats-replies-1571866729558724609.json", JSON.stringify(getAllReplies), "utf8");
    //   writeFileSync("./logs/tweet-stats-likes-1568884114308349952.json", JSON.stringify(allLikedUsers), "utf8");
    //   writeFileSync("./logs/tweet-stats-retweets-1568884114308349952.json", JSON.stringify(reTweetData), "utf8");
      // fs.writeFileSync("./logs/tweet-stats-quotes-1569953613073764352.json", JSON.stringify(QuotedTweets), "utf8");
  // })();
})();
