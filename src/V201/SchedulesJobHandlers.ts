import WorkerManager from './SchedulesWorkerManager';
import { CampaignSheduledEvents } from './AppEvents';
import { Job } from 'bullmq';
import { TaskSchedulerJobType } from './schedulerQueue';

// Define the processor function
const processCloseCampaignJob = async (
  job: Job<
    TaskSchedulerJobType<CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION>
  >
) => {
  console.log(`Processing campaign close job:`, job.data);
  const Jobdata = job.data;
  console.log(Jobdata.data);
  // Your business logic here
};

// Register worker for campaign close operations
const registerScheduleJobWorkers = async () => {
  await WorkerManager.initializeWorker(
    CampaignSheduledEvents.CAMPAIGN_CLOSE_OPERATION,
    processCloseCampaignJob
  );
};

registerScheduleJobWorkers();
