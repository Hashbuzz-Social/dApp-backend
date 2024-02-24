
import dotenv from "dotenv";
dotenv.config();
import './pre-start'; // Must be the first import

import crontabService from "@services/cronTasks-service";
import { deployContractNew } from "@services/smartcontract-service";
import server from './server';

const serverStartMsg = 'Express server started on port: ',
    port = (process.env.PORT || 3000);

// Start server
server.listen(port, () => {
    console.log("Listen on port: ", port);
});

async function startServer() {
    await deployContractNew();
    await crontabService.checkPreviousCampaignCloseTime();
}

startServer().catch(error => {
    console.error('Error starting server:', error);
});