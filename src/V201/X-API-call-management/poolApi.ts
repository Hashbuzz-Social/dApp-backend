// Helper to get pool state for API
import { WindowPoolManager } from './windowPool';

const poolManager = new WindowPoolManager();

export async function getPoolState(endpoint: string) {
  await poolManager.loadPoolFromRedis(endpoint);
  return poolManager.getPool(endpoint);
}
