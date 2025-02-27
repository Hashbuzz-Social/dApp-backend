import PrismaClientManager from './prismaClient';
import { consumeFromQueue } from './redisQueue';

const processEvent = async (
  eventId: number | bigint,
  eventType: string,
  payload: any
) => {
  console.log(`Processing event ${eventType}`, payload);

  if (eventType === 'user.created') {
    // Example: Send a welcome email
    console.log(`Sending welcome email to ${payload.email}`);
  }

  const prisma = await PrismaClientManager.getInstance();
  await prisma.eventOutBox.delete({
    where: {
      event_type: eventType,
      id: eventId,
    },
  });
};

consumeFromQueue('event-queue', async (event) => {
  await processEvent(event.eventId, event.eventType, event.payload);
});
