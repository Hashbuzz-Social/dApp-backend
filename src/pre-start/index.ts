import cronTasksService from "@services/cronTasks-service";
import cron from "node-cron";
import associatedTokens from "./associatedTokens";
import { cronJobs, scheduleOptions } from "./cronJob";
import setVariables from "./setVariables";

const preStartJobs = async () => {
  await setVariables();
  associatedTokens.checkAvailableTokens();
  // Schedule all cron jobs
  cronTasksService.scheduleExpiryTasks();
  cronJobs.forEach(({ schedule, task }) => {
    cron.schedule(schedule, task, scheduleOptions).start();
  });
  console.log("Pre-start jobs done");
};

export default preStartJobs;
