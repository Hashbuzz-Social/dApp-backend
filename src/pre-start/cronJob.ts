import crontabService from "@services/cronTasks-service";

// Common scheduling options
export const scheduleOptions = {
  scheduled: false,
};

// Configuration for cron jobs
export const cronJobs = [
  {
    schedule: "* * * * *",// Every minute
    task: () => {
      // crontabService.updateCardStatus();
      // crontabService.autoCampaignClose();
      // crontabService.checkCampaignCloseTime();
      // crontabService.scheduleExpiryTasks();
    },
  },
  {
    schedule: "* * * * * *",// Every second
    task: () => {
      // Add functionality if needed
    },
  },
  {
    schedule: "*/2 * * * *", // Every 2 minutes
    task: () => {
      // crontabService.checkForRepliesAndUpdateEngagementsData();
    },
  },
  {
    schedule: "*/5 * * * *", // Every 5 minutes
    task: () => {
      // crontabService.checkForRepliesAndUpdateEngagementsData();
    },
  },
  {
    schedule: "*/15 * * * *", // Every 15 minutes
    task: () => {
      // crontabService.checkForRepliesAndUpdateEngagementsData();
    },
  },
  {
    schedule: "*/40 * * * *", // Every 40 minutes
    task: () => {
    },
  },
  {
    schedule: "0 0 * * *", // Every day at midnight
    task: () => {
      // crontabService.checkForRepliesAndUpdateEngagementsData();
    },
  },
];



