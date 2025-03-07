import RedisClient from '@services/redis-servie';
import appConfigManager from 'src/V201/appConfigManager';

const getRedisClient = async () => {
  const configs = await appConfigManager.getConfig();
  const rClinet = new RedisClient(configs.db.redisServerURI);
  return rClinet.client;
};

export const publishToQueue = async (queue: string, data: any) => {
  const redisClient = await getRedisClient();
  await redisClient.rPush(queue, JSON.stringify(data));
};

export const consumeFromQueue = async (
  queue: string,
  callback: (data: any) => void
) => {
  const redisClient = await getRedisClient();
  while (true) {
    const data = await redisClient.lPop(queue);
    if (data) {
      callback(JSON.parse(data));
    }
  }
};
