import { eventBus } from "./eventBus";
import { publishToQueue } from "./redisQueue";
import { saveEvent } from "./eventOutBox";

export const publishEvent = async (eventType: string, payload: any) => {
  eventBus.emit(eventType, payload);
  const event = await saveEvent(eventType, payload);
  await publishToQueue("event-queue", { eventType, payload , eventId: event.id});
};
