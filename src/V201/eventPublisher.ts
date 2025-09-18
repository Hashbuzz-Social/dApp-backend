import { eventBus } from "./eventBus";
import { publishToQueue } from "./redisQueue";
import { saveEvent } from "./eventOutBox";
import { EventPayloadMap } from './Types/eventPayload';
import { EnhancedEventSystem } from './enhancedEventSystem';
import logger from 'jet-logger';

export type QueueEventFormat = {
  eventType: keyof EventPayloadMap;
  payload: EventPayloadMap[keyof EventPayloadMap];
  eventId: number;
};

/**
 * Legacy event publisher - maintained for backward compatibility
 * For new implementations, consider using EnhancedEventSystem.publishEvent
 */
export const publishEvent = async <K extends keyof EventPayloadMap>(
  eventType: K,
  payload: EventPayloadMap[K],
  options?: {
    useEnhanced?: boolean;
    maxRetries?: number;
    priority?: 'low' | 'normal' | 'high';
  }
) => {
  // Use enhanced system if explicitly requested
  if (options?.useEnhanced) {
    return await EnhancedEventSystem.publishEvent(eventType, payload, options);
  }

  // Legacy implementation
  try {
    eventBus.emit(eventType, payload);
    const event = await saveEvent(eventType, payload);
    if (event) {
      await publishToQueue('event-queue', {
        eventType,
        payload,
        eventId: event.id,
      });
      logger.info(`Event published (legacy): ${eventType} (ID: ${event.id})`);
      return event.id;
    }
    return null;
  } catch (error) {
    logger.err(
      `Failed to publish event (legacy) ${eventType}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
};

/**
 * Enhanced event publisher - recommended for new implementations
 */
export const publishEnhancedEvent = <K extends keyof EventPayloadMap>(
  eventType: K,
  payload: EventPayloadMap[K],
  options?: {
    maxRetries?: number;
    priority?: 'low' | 'normal' | 'high';
    delayMs?: number;
  }
) => EnhancedEventSystem.publishEvent(eventType, payload, options);

// Export enhanced system for additional features
export { EnhancedEventSystem };
