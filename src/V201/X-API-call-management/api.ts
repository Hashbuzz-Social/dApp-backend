// Express API endpoints for campaign management
import express from 'express';
import { enqueueJob } from './jobQueue';
import { getJobStatus } from './jobState';
import { getPoolState } from './poolApi';
import { getTenantQuota } from './tenantQuota';
import { register as metricsRegister } from './metrics';
// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Prometheus metrics endpoint
router.get('/metrics', async (req, res) => {
  res.set('Content-Type', metricsRegister.contentType);
  res.end(await metricsRegister.metrics());
});

const router = express.Router();

// POST /campaigns - Submit new campaign
router.post('/campaigns', async (req, res) => {
  const job = req.body;
  await enqueueJob(job);
  res.json({ success: true, job });
});

// GET /campaigns/:id - Get campaign status and results
router.get('/campaigns/:id', async (req, res) => {
  const status = await getJobStatus(req.params.id);
  res.json({ status });
});

// GET /pools - View current rate limit states
router.get('/pools', async (req, res) => {
  // Example: recent_search and liking_users
  const recent = await getPoolState('recent_search');
  const likes = await getPoolState('liking_users');
  res.json({ recent, likes });
});

// GET /stats - System usage metrics and health
router.get('/stats', async (req, res) => {
  // Stub: return static health info
  res.json({ healthy: true });
});

// GET /tenants/:id/quota - Tenant-specific quotas
router.get('/tenants/:id/quota', async (req, res) => {
  const quota = await getTenantQuota(req.params.id);
  res.json({ quota });
});

export default router;
