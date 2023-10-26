
import dotenv from "dotenv";
dotenv.config();

import './pre-start'; // Must be the first import
import logger from 'jet-logger';
import server from './server';
import { deployContractNew, queryBalance } from "@services/smartcontract-service";

// Constants
const serverStartMsg = 'Express server started on port: ',
    port = (process.env.PORT || 3000);

// Start server
server.listen(port, async () => {
    await deployContractNew();
    logger.info(serverStartMsg + port);
    console.log("Listen on port: ", port);
});
