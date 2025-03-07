import { eventBus } from "./eventBus";
import { publishToQueue } from "./redisQueue";
import { saveEvent } from "./eventOutBox";
import { EventPayloadMap } from './Types/eventPayload';

export const publishEvent = async <K extends keyof EventPayloadMap>(eventType: K, payload: EventPayloadMap[K]) => {
  eventBus.emit(eventType, payload);
  const event = await saveEvent(eventType, payload);
  await publishToQueue("event-queue", { eventType, payload, eventId: event.id });
};
