import type { PrismaClient } from '@prisma/client';
import * as mqtt from 'mqtt';

// Listener function type
export type ListenerFunction<T> = (payload: {
  args: any;
  model: ModelNames;
  result: T;
}) => Promise<void> | void;

// Listener configuration
export interface ListenerConfig<T> {
  where?: Partial<{ [K in keyof T]: true | T[K][] | string | ((value: T[K]) => boolean) }>;
  data?: Record<string, any>;
  listener: ListenerFunction<T>;
  allowRemote?: boolean; // If true, also listen to MQTT events from other servers
}

// Derive model names from PrismaClient delegates
export type ModelNames = {
  [K in Extract<keyof PrismaClient, string>]: 
    PrismaClient[K] extends { findUnique: (...args: any[]) => any } ? K : never
}[Extract<keyof PrismaClient, string>];

// MQTT configuration types
export interface MqttConfig {
  enabled: boolean;
  brokerUrl: string;
  options?: mqtt.IClientOptions;
  topicPrefix?: string; // Default: 'prisma/events'
}

// Extension options
export type ExtensionOptions = {
  emit?: {
    emitOnUpsert?: boolean;
    emitOnCreate?: boolean;
    emitOnUpdate?: boolean;
    emitOnUpdateMany?: boolean;
  } | boolean;
  mqtt?: MqttConfig;
};

// MQTT event payload
export interface MqttEventPayload {
  model: ModelNames;
  operation: string;
  args: any;
  result: any;
  timestamp: string;
}
