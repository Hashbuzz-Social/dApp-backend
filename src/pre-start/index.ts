/**
 * Pre-start is where we want to place things that must run BEFORE the express server is started.
 * This is useful for environment variables, command-line arguments, and cron-jobs.
 */

import dotenv from 'dotenv';
import { taskEveryMinute , taskEverySixDay } from './cronJob';


(() => {
    // Setup command line options
    dotenv.config();
    taskEveryMinute.start();
    taskEverySixDay.start();
    // await getAllReplies("1559560034744381442");
})();
