// Per-tenant credit buckets and quota tracking
import { redis } from './redisClient';

export async function setTenantQuota(tenantId: string, quota: number) {
  await redis.hset(`tenant:${tenantId}:quota`, 'quota', quota);
}

export async function getTenantQuota(tenantId: string): Promise<number> {
  const quota = await redis.hget(`tenant:${tenantId}:quota`, 'quota');
  return quota ? parseInt(quota) : 0;
}
