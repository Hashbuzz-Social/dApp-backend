import RedisClient from '@services/redis-servie';
import appConfigManager from 'src/V201/appConfigManager';
import { safeParsedData, safeStringifyData } from './Modules/common';
import { setTimeout } from 'timers/promises';

let redisClient: RedisClient | null = null;

const getRedisClient = async () => {
  if (!redisClient) {
    const configs = await appConfigManager.getConfig();
    redisClient = new RedisClient(configs.db.redisServerURI);
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
  callback: (data: any) => void
) => {
  const redisClient = await getRedisClient();
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  while (true) {
    const data = await redisClient.lPop(queue);
    if (data) {
      callback(safeParsedData(data));
    } else {
      await setTimeout(100); // Small delay to prevent CPU overload
    }
  }
};
