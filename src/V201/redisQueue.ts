import { createClient } from "redis";

const redisClient = createClient({ url: process.env.REDIS_URL });

redisClient.on("error", (err) => console.error("Redis Error:", err));

export const publishToQueue = async (queue: string, data: any) => {
  await redisClient.rPush(queue, JSON.stringify(data));
};

export const consumeFromQueue = async (queue: string, callback: (data: any) => void) => {
  while (true) {
    const data = await redisClient.lPop(queue);
    if (data) {
      callback(JSON.parse(data));
    }
  }
};
