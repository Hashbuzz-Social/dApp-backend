
import crontabService from "@services/cronTasks-service";

/**
 * @deprecated All after-start jobs are disabled for maintenance.
 * This function previously handled:
 * - Checking previous campaign close times
 * - Processing backlog campaigns
 */
const adterSatartJobs = async () => {
    console.log("After-start jobs starts");
    // await crontabService.checkPreviousCampaignCloseTime();z
    console.log("After-start jobs done");
}

export default adterSatartJobs;
