import * as mqtt from 'mqtt';
import { MqttConfig, MqttEventPayload, ModelNames, ListenerConfig } from './types';
import { matches } from './listeners';
import { logger } from './logger';

// MQTT client instances
let mqttPublisher: mqtt.MqttClient | null = null;
let mqttSubscriber: mqtt.MqttClient | null = null;
let mqttConfig: MqttConfig | null = null;

// Track MQTT subscriptions
const mqttSubscriptions: Map<string, Set<ListenerConfig<any>>> = new Map();

/**
 * Initialize MQTT publisher client
 */
export function initializeMqtt(config: MqttConfig): void {
  if (!config.enabled) return;
  
  try {
    mqttConfig = config;
    mqttPublisher = mqtt.connect(config.brokerUrl, config.options);
    
    mqttPublisher.on('connect', () => {
      logger.info('MQTT client connected to broker:', config.brokerUrl);
    });
    
    mqttPublisher.on('error', (err) => {
      logger.error('MQTT connection error:', err);
    });
    
    mqttPublisher.on('close', () => {
      logger.debug('MQTT connection closed');
    });
  } catch (error) {
    logger.error('Failed to initialize MQTT client:', error);
  }
}

/**
 * Publish event to MQTT broker
 */
export async function publishToMqtt(
  model: ModelNames,
  args: any,
  result: any,
  operation: string
): Promise<void> {
  if (!mqttPublisher || !mqttConfig?.enabled || !mqttPublisher.connected) {
    return;
  }
  
  const topicPrefix = mqttConfig.topicPrefix || 'prisma/events';
  const topic = `${topicPrefix}/${model}/${operation}`;
  
  const payload: MqttEventPayload = {
    model,
    operation,
    args,
    result,
    timestamp: new Date().toISOString()
  };
  
  return new Promise<void>((resolve, reject) => {
    mqttPublisher!.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) {
        logger.error(`Failed to publish to MQTT topic ${topic}:`, err);
        reject(err);
      } else {
        logger.debug('Published event to MQTT:', topic);
        resolve();
      }
    });
  });
}

/**
 * Initialize MQTT subscriber if not already initialized
 */
function ensureSubscriberInitialized(): void {
  if (mqttSubscriber || !mqttConfig?.enabled) {
    return;
  }
  
  try {
    const subscriberOptions = {
      ...mqttConfig.options,
      clientId: mqttConfig.options?.clientId 
        ? `${mqttConfig.options.clientId}-subscriber`
        : `prisma-subscriber-${Math.random().toString(36).substr(2, 9)}`
    };
    
    mqttSubscriber = mqtt.connect(mqttConfig.brokerUrl, subscriberOptions);
    
    mqttSubscriber.on('connect', () => {
      logger.info('MQTT subscriber connected to broker:', mqttConfig!.brokerUrl);
    });
    
    mqttSubscriber.on('error', (err) => {
      logger.error('MQTT subscriber error:', err);
    });
    
    mqttSubscriber.on('message', (topic, message) => {
      handleMqttMessage(topic, message);
    });
    
    mqttSubscriber.on('close', () => {
      logger.debug('MQTT subscriber connection closed');
    });
  } catch (error) {
    logger.error('Failed to initialize MQTT subscriber:', error);
  }
}

/**
 * Handle incoming MQTT messages
 */
function handleMqttMessage(topic: string, message: Buffer): void {
  try {
    const event: MqttEventPayload = JSON.parse(message.toString());
    const { model, args, result } = event;
    
    // Get subscribers for this topic
    const subscribers = mqttSubscriptions.get(topic);
    if (!subscribers || subscribers.size === 0) {
      return;
    }
    
    // Execute all matching listeners
    subscribers.forEach(async (config) => {
      if (matches(config, args)) {
        try {
          await config.listener({ args, model, result });
        } catch (err) {
          logger.error(`Remote listener for ${model} failed`, err);
        }
      }
    });
  } catch (err) {
    logger.error('Failed to parse MQTT message:', err);
  }
}

/**
 * Subscribe to MQTT topic for a model
 */
export function subscribeToMqttTopic(
  model: ModelNames,
  config: ListenerConfig<any>
): void {
  if (!mqttConfig?.enabled) {
    logger.warn('MQTT not configured. Cannot subscribe to remote events.');
    return;
  }
  
  ensureSubscriberInitialized();
  
  if (!mqttSubscriber) {
    logger.error('Failed to initialize MQTT subscriber');
    return;
  }
  
  const topicPrefix = mqttConfig.topicPrefix || 'prisma/events';
  // Subscribe to all operations for this model
  const topic = `${topicPrefix}/${model}/#`;
  
  // Add config to subscriptions
  if (!mqttSubscriptions.has(topic)) {
    mqttSubscriptions.set(topic, new Set());
    
    // Actually subscribe to MQTT topic
    mqttSubscriber.subscribe(topic, (err) => {
      if (err) {
        logger.error(`Failed to subscribe to MQTT topic ${topic}:`, err);
      } else {
        logger.info(`Subscribed to MQTT topic: ${topic}`);
      }
    });
  }
  
  mqttSubscriptions.get(topic)!.add(config);
}

/**
 * Unsubscribe from MQTT topic
 */
export function unsubscribeFromMqttTopic(
  model: ModelNames,
  config: ListenerConfig<any>
): void {
  if (!mqttConfig?.enabled || !mqttSubscriber) {
    return;
  }
  
  const topicPrefix = mqttConfig.topicPrefix || 'prisma/events';
  const topic = `${topicPrefix}/${model}/#`;
  
  const subscribers = mqttSubscriptions.get(topic);
  if (subscribers) {
    subscribers.delete(config);
    
    // If no more subscribers, unsubscribe from MQTT
    if (subscribers.size === 0) {
      mqttSubscriber.unsubscribe(topic, (err) => {
        if (err) {
          logger.error(`Failed to unsubscribe from MQTT topic ${topic}:`, err);
        } else {
          logger.debug(`Unsubscribed from MQTT topic: ${topic}`);
        }
      });
      mqttSubscriptions.delete(topic);
    }
  }
}

/**
 * Disconnect MQTT clients
 */
export function disconnectMqtt(): Promise<void> {
  return new Promise((resolve) => {
    const promises: Promise<void>[] = [];
    
    // Disconnect publisher
    if (mqttPublisher) {
      promises.push(new Promise<void>((res) => {
        mqttPublisher!.end(false, {}, () => {
          logger.debug('MQTT publisher disconnected');
          mqttPublisher = null;
          mqttConfig = null;
          res();
        });
      }));
    }
    
    // Disconnect subscriber
    if (mqttSubscriber) {
      promises.push(new Promise<void>((res) => {
        mqttSubscriber!.end(false, {}, () => {
          logger.debug('MQTT subscriber disconnected');
          mqttSubscriber = null;
          mqttSubscriptions.clear();
          res();
        });
      }));
    }
    
    if (promises.length === 0) {
      resolve();
    } else {
      Promise.all(promises).then(() => resolve());
    }
  });
}
