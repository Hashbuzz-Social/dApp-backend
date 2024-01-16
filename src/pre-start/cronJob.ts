import cron from "node-cron";
import crontabService from "@services/cronTasks-service";

export const taskEveryMinute = cron.schedule(
  "* * * * *",
  () => {
    // console.info("running a task every minute");
    crontabService.autoCampaignClose();
    crontabService.updateCardStatus();
  },
  {
    scheduled: false,
  }
);

export const taskEverySeconds = cron.schedule(
  "* * * * * *",
  () => {
    // console.info("running a task every minute");
  },
  {
    scheduled: false,
  }
);

export const taskOnEvery30Seconds = cron.schedule(
  "*/5 * * * *",
  () => {
    // console.info("running a task every 30");
    crontabService.checkCampaignCloseTime();
  },
  {
    scheduled: false,
  }
);

export const taskOnEvery15Minutes = cron.schedule(
  "*/5 * * * *",
  () => {
    crontabService.checkForRepliesAndUpdateEngagementsData();
  },
  {
    scheduled: false,
  }
);

export const taskEveryTwoMinute = cron.schedule(
  "*/40 * * * *",
  () => {
    crontabService.scheduleExpiryTasks();
    // console.info("running a task every Two minutes");
  },
  {
    scheduled: false,
  }
);


export const taskAtEveryMidNight = cron.schedule('0 0 0 * * *', () => {
  crontabService.checkForRepliesAndUpdateEngagementsData();
}, { scheduled: false })