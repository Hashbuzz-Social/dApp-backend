
import associatedTokens from "./associatedTokens";
import { taskAtEveryMidNight, taskEveryMinute, taskEverySeconds, taskEveryTwoMinute, taskOnEvery15Minutes, taskOnEvery30Seconds } from "./cronJob";
import cronTasksService from "@services/cronTasks-service";

(() => {
    taskAtEveryMidNight.start();
    taskOnEvery30Seconds.start();
    taskEveryMinute.start();
    taskEverySeconds.start();
    taskEveryTwoMinute.start();
    taskOnEvery15Minutes.start();
    cronTasksService.scheduleExpiryTasks();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    associatedTokens.checkAvailableTokens(process.env.HASHBUZZ_CONTRACT_ADDRESS);

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
