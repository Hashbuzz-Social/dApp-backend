import RedisClient from '@services/redis-service'
// import appConfigManager from 'src/V201/appConfigManager';
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
  callback: (data: any) => void
) => {
  const redisClient = await getRedisClient();
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  const keepConsuming = true;
  while (keepConsuming) {
    const data = await redisClient.lPop(queue);
    if (data) {
      callback(safeParsedData(data));
    } else {
      await setTimeout(100); // Small delay to prevent CPU overload
    }
    // Optionally, you can set keepConsuming = false to break the loop if needed
  }
};
