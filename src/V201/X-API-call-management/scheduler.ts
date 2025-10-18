// Campaign Scheduler with window-based admission
import { getCurrentWindowBucket, getNextWindowBucket } from './windowBucket';
import { enqueueJob, dequeueJobs } from './jobQueue';
import { canAdmitCampaign } from './admissionControl';

export class CampaignScheduler {
  async scheduleJob(job: any, pools: any, capRemaining: number) {
    // Admission control for current window
    const windowBucket = getCurrentWindowBucket();
    if (canAdmitCampaign(job.type, pools.recent.remaining, pools.likes.remaining, capRemaining)) {
      job.scheduledWindow = windowBucket;
      await enqueueJob(job);
      return { admitted: true, window: windowBucket };
    } else {
      // Queue for next window
      const nextWindow = getNextWindowBucket();
      job.scheduledWindow = nextWindow;
      await enqueueJob(job);
      return { admitted: false, window: nextWindow };
    }
  }

  async processWindow(windowBucket: number, count = 10) {
    // Dequeue jobs for this window
    const jobs = await dequeueJobs(windowBucket, count);
    // ...process jobs (dispatch to worker, update states)...
    return jobs;
  }
}
