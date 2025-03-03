import PrismaClientManager from './prismaClient';

export const saveEvent = async (eventType: string, payload: any) => {
  const prisma = await PrismaClientManager.getInstance();

  return await prisma.eventOutBox.create({
    data: {
      event_type: eventType,
      payload: JSON.stringify(payload),
    },
  });
};
