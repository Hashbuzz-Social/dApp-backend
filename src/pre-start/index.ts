import cronTasksService from "@services/cronTasks-service";
import associatedTokens from "./associatedTokens";
import { taskEvery5Minutes, taskEveryMidnight, taskEveryMinute } from "./cronJob";
import setGlobalVariables from "./setglobalvariables";

(() => {
  taskEveryMidnight.start();
  // taskOnEvery30Seconds.start();
  taskEveryMinute.start();

  taskEvery5Minutes.start();
//   taskEvery15Minutes.start();
  cronTasksService.scheduleExpiryTasks();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //@ts-ignore
  associatedTokens.checkAvailableTokens(process.env.HASHBUZZ_CONTRACT_ADDRESS);
  setGlobalVariables();
})();
