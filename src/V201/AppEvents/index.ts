import { BalanceEvents } from "./balances";
import { CampaignEvents } from "./campaign";
import { TransactionEvents } from "./transaction";

// filepath: /home/hashbuzz-social/Desktop/hashbuzz/dApp-backend/src/V201/AppEvents/index.ts
export * from "./balances";
export * from "./campaign";
export * from "./transaction";


export type AppEvents = CampaignEvents | TransactionEvents |  BalanceEvents;