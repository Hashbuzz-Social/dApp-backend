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
import { safeStringifyData } from './Modules/common';
import PrismaClientManager from './prismaClient';

export const saveEvent = async (eventType: string, payload: any) => {
  try {
    const prisma = await PrismaClientManager.getInstance();
    const result = await prisma.eventOutBox.create({
      data: {
        event_type: eventType,
        payload: safeStringifyData(payload),
      },
    });
    console.log(`Event saved: ${eventType}`, result);
    return result;
  } catch (error) {
    console.error('Error saving event:', error);
  }
};