import { ModelNames } from './types';
import { camelizeIt } from './utils';
import { executeLocalListeners } from './listeners';
import { publishToMqtt } from './mqtt';
import { logger } from './logger';

/**
 * Run both local listeners and publish to MQTT
 * @param local - Whether to run local listeners (default: true)
 * @param remote - Whether to publish to MQTT (default: true)
 */
export async function runListeners<T>(
  model: ModelNames,
  args: any,
  result: T,
  operation: string = 'unknown',
  options: { local?: boolean; remote?: boolean } = {}
): Promise<void> {
  const { local = true, remote = true } = options;
  
  // Run local listeners if enabled
  if (local) {
    const camelizedModel = camelizeIt(model);
    await executeLocalListeners(camelizedModel as ModelNames, args, result, 'local');
  }
  
  // Publish to MQTT if configured and enabled
  if (remote) {
    try {
      await publishToMqtt(model, args, result, operation);
    } catch (err) {
      logger.error(`MQTT publish for ${model} failed`, err);
    }
  }
}
