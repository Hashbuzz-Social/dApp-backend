// Prometheus metrics export
import client from 'prom-client';

export const collectDefaultMetrics = client.collectDefaultMetrics;
export const register = client.register;

export const jobProcessedCounter = new client.Counter({
  name: 'jobs_processed_total',
  help: 'Total number of processed campaign jobs',
});

export const errorCounter = new client.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
});
