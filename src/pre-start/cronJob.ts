import cron from "node-cron";
import crontabService from "@services/cronTasks-service";

export const taskEveryMinute = cron.schedule(
  "* * * * *",
  () => {
    // console.info("running a task every minute");
  },
  {
    scheduled: false,
  }
);

export const taskEveryTwoMinute = cron.schedule(
  "*/2 * * * *",
  () => {
    crontabService.updateCardStatus();
    // console.info("running a task every Two minutes");
  },
  {
    scheduled: false,
  }
);


export const taskAtEveryMidNight= cron.schedule('0 0 0 * * *' , () => {
  crontabService.checkForRepliesAndUpdateEngagementsData();
},{scheduled:false})