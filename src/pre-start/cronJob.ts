import cron from "node-cron";
import crontabService from "@services/cronTasks-service";

export const taskEveryMinute = cron.schedule(
  "* * * * *",
  () => {
    // crontabService.updateCardStatus();
    console.info("running a task every minute");
  },
  {
    scheduled: false,
  }
);

export const taskEverySixDay = cron.schedule(
  "*/2 * * * *",
  () => {
    console.info("running a task every Two minutes");
  },
  {
    scheduled: false,
  }
);
