import { ListenerConfig, ModelNames } from './types';
import { listeners } from './listeners';
import { subscribeToMqttTopic, unsubscribeFromMqttTopic } from './mqtt';

/**
 * Register a listener for a model.
 * Returns an unsubscribe function.
 */
export function prismaEventListener<T>(
  model: ModelNames,
  config: ListenerConfig<T>
): () => void {
  // Register local listener
  if (!listeners[model]) {
    listeners[model] = [];
  }
  listeners[model].push(config as any);
  
  // Subscribe to MQTT if allowRemote is true
  if (config.allowRemote) {
    subscribeToMqttTopic(model, config as any);
  }
  
  // Return unsubscribe function
  return () => {
    // Remove local listener
    listeners[model] = listeners[model].filter(l => l !== (config as any));
    
    // Unsubscribe from MQTT if was subscribed
    if (config.allowRemote) {
      unsubscribeFromMqttTopic(model, config as any);
    }
  };
}
