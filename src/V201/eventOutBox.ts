/**
 * Saves an event to the eventOutBox table in the database.
 *
 * @param eventType - The type of the event being saved.
 * @param payload - The payload of the event, which will be stringified and stored.
 * @returns A promise that resolves to the created eventOutBox record.
 *
 * @example
 * ```typescript
 * const eventType = "USER_SIGNUP";
 * const payload = { userId: 123, timestamp: Date.now() };
 * const savedEvent = await saveEvent(eventType, payload);
 * console.log(savedEvent);
 * ```
 */
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
