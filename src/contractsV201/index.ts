import * as HashbuzzV201 from "./HashbuzzV201.json";
import * as CampaignLifecycle from "./Lifecycle.json";
import * as Transactions from "./Transactions.json";
import * as Utils from "./Utils.json";
import * as HashbuzzStates from "./HashbuzzStates.json";
import * as eventsByFunctionName from "./EventsByFunctionName.json";

const eventList: { [key: string]: string[] } = eventsByFunctionName

export { HashbuzzV201, CampaignLifecycle, Transactions, Utils, HashbuzzStates, eventList };