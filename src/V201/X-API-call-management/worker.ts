// Worker process for executing queued jobs
import { dequeueJobs } from './jobQueue';
import { setJobStatus } from './jobState';
import { getCurrentWindowBucket } from './windowBucket';

export async function processQueuedJobs() {
  const windowBucket = getCurrentWindowBucket();
  const jobs = await dequeueJobs(windowBucket, 10);
  for (const job of jobs) {
    await setJobStatus(job.id, 'processing');
    // ...execute job logic (call XApiClient, etc)...
    // On success:
    await setJobStatus(job.id, 'completed');
    // On failure:
    // await setJobStatus(job.id, 'failed');
  }
}
