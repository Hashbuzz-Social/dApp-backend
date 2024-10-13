import cron from "node-cron";
import crontabService from "@services/cronTasks-service";
import cronTasksService from "@services/cronTasks-service";

// Common scheduling options
const scheduleOptions = {
  scheduled: false,
};

export const taskEveryMinute = cron.schedule(
  "* * * * *",
  () => {
    crontabService.updateCardStatus();
    crontabService.autoCampaignClose();
    crontabService.checkCampaignCloseTime();
  },
  scheduleOptions
);

export const taskEverySecond = cron.schedule(
  "* * * * * *",
  () => {
    // Add functionality if needed
  },
  scheduleOptions
);

export const taskEvery5Minutes = cron.schedule(
  "*/5 * * * *",
  () => {
    crontabService.checkForRepliesAndUpdateEngagementsData();
  },
  scheduleOptions
);

export const taskEvery15Minutes = cron.schedule(
  "*/15 * * * *",
  () => {
    // crontabService.checkForRepliesAndUpdateEngagementsData();
  },
  scheduleOptions
);

export const taskEvery40Minutes = cron.schedule(
  "*/40 * * * *",
  () => {
    crontabService.scheduleExpiryTasks();
  },
  scheduleOptions
);

export const taskEveryMidnight = cron.schedule(
  "0 0 * * *",
  () => {
    crontabService.checkForRepliesAndUpdateEngagementsData();
    cronTasksService.checkForExpriredSessionsAndDelete();
  },
  scheduleOptions
);
