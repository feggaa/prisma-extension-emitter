/**
 * Prisma Extension Emitter
 * 
 * A Prisma extension that adds event emission capabilities with MQTT support
 * for multi-server architectures.
 */

// Export types
export type {
  ListenerFunction,
  ListenerConfig,
  ModelNames,
  MqttConfig,
  ExtensionOptions,
  MqttEventPayload
} from './types';

// Export main functions
export { listenerExtensionConfig } from './extension';
export { prismaEventListener } from './event-listener';
export { disconnectMqtt } from './mqtt';

// Export listeners registry (for advanced use cases)
export { listeners } from './listeners';
