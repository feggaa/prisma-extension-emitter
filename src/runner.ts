import { ModelNames } from './types';
import { camelizeIt } from './utils';
import { executeLocalListeners } from './listeners';
import { publishToMqtt } from './mqtt';
import { logger } from './logger';

/**
 * Run both local listeners and publish to MQTT
 */
export async function runListeners<T>(
  model: ModelNames,
  args: any,
  result: T,
  operation: string = 'unknown'
): Promise<void> {
  // Run local listeners
  const camelizedModel = camelizeIt(model);
  await executeLocalListeners(camelizedModel as ModelNames, args, result);
  
  // Publish to MQTT if configured
  try {
    await publishToMqtt(model, args, result, operation);
  } catch (err) {
    logger.error(`MQTT publish for ${model} failed`, err);
  }
}
