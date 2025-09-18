import cronTasksService from "@services/cronTasks-service";
import cron from "node-cron";
import associatedTokens from "./associatedTokens";
import { cronJobs, scheduleOptions } from "./cronJob";
import setVariables from "./setVariables";

/**
 * @deprecated All pre-start jobs are disabled for maintenance.
 * This function previously handled:
 * - Environment variable setup
 * - Token availability checks
 * - Cron job scheduling
 * - Expiry task initialization
 */
const preStartJobs = async () => {
  // DEPRECATED: Variable setup disabled for maintenance
  // This sets up environment variables and configurations
  // await setVariables();

  // DEPRECATED: Token availability checks disabled for maintenance
  // This checks for available associated tokens
  // associatedTokens.checkAvailableTokens();

  // DEPRECATED: Expiry task scheduling disabled for maintenance
  // cronTasksService.scheduleExpiryTasks();

  // DEPRECATED: Cron job scheduling disabled for maintenance
  // These cron jobs were responsible for:
  // - Campaign status updates (every minute)
  // - Auto campaign closing (every minute)
  // - Engagement data updates (every 2 minutes)
  // - Expiry task scheduling (commented)
  /*
  cronJobs.forEach(({ schedule, task }) => {
    cron.schedule(schedule, task, scheduleOptions).start();
  });
  */

  console.log('Pre-start jobs done => latest (ALL JOBS DISABLED)');
};

export default preStartJobs;
