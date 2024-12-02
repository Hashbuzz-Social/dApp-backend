import cronTasksService from "@services/cronTasks-service";
import associatedTokens from "./associatedTokens";
import { taskEvery5Minutes, taskEveryMidnight, taskEveryMinute, taskEvery2Minutes } from "./cronJob";
import setVariables from "./setVariables";

const preStartJobs = async () => {
  await setVariables();
  associatedTokens.checkAvailableTokens();
  // taskEveryMidnight.start();
  // taskEveryMinute.start();
  // taskEvery2Minutes.start();
  // taskEvery5Minutes.start();
  // cronTasksService.scheduleExpiryTasks();
  console.log("Pre-start jobs done");
};

export default preStartJobs;
