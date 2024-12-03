
import crontabService from "@services/cronTasks-service";

const adterSatartJobs = async () => {
    console.log("After-start jobs starts");
    await crontabService.checkPreviousCampaignCloseTime();
    console.log("After-start jobs done");
}

export default adterSatartJobs;