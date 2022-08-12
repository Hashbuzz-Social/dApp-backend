import cron from "node-cron";
import crontabService from '@services/cronTasks-service'

export const task = cron.schedule(
  "* * * * *",
  () => {
    crontabService.updateCardStatus();
    console.log("running a task every minute");
    
  },
  {
    scheduled: false,
  }
);

