import RedisClient from '@services/redis-service';
import { safeParsedData, safeStringifyData } from './Modules/common';
import { setTimeout } from 'timers/promises';
import { getConfig } from '@appConfig';

let redisClient: RedisClient | null = null;

const getRedisClient = async () => {
  if (!redisClient) {
    const config = await getConfig();
    redisClient = new RedisClient(config.db.redisServerURI);
  }
  return redisClient.client;
};

export const publishToQueue = async (queue: string, data: any) => {
  const redisClient = await getRedisClient();
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  await redisClient.rPush(queue, safeStringifyData(data));
};

export const consumeFromQueue = async (
  queue: string,
  callback: (data: any) => void,
  options?: { signal?: AbortSignal }
) => {
  const redisClient = await getRedisClient();
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  while (!options?.signal?.aborted) {
    const data = await redisClient.lPop(queue);
    if (data) {
      callback(safeParsedData(data));
    } else {
      await setTimeout(100); // Small delay to prevent CPU overload
    }
    // The loop will break if the AbortSignal is triggered
  }
};
