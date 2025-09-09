import { eventBus } from "./eventBus";
import { publishToQueue } from "./redisQueue";
import { saveEvent } from "./eventOutBox";
import { EventPayloadMap } from './Types/eventPayload';

export type QueueEventFormat = {
  eventType: keyof EventPayloadMap;
  payload: EventPayloadMap[keyof EventPayloadMap];
  eventId: number;
}

export const publishEvent = async <K extends keyof EventPayloadMap>(eventType: K, payload: EventPayloadMap[K]) => {
  eventBus.emit(eventType, payload);
  const event = await saveEvent(eventType, payload);
  if (event) {
    await publishToQueue("event-queue", { eventType, payload, eventId: event.id });
  }
};
