import { ListenerConfig, ModelNames } from './types';
import { logger } from './logger';

// Listeners map: model name to array of configs
export const listeners: Record<ModelNames, ListenerConfig<any>[]> = {} as any;

/**
 * Check if args match the listener config filters
 */
export function matches<T>(config: ListenerConfig<T>, args: any): boolean {
  const where = !config.where ? true : (
    Object.entries(config.where) as [keyof T, true | T[keyof T][] | ((v: any) => boolean)][]
  ).every(([field, cond]) => {
    const val = args.where?.[field];
    if (cond === true) return val !== undefined;
    if (cond === val) return true;
    if (Array.isArray(cond)) return cond.includes(val);
    if (typeof cond === 'function') return (cond as (v: any) => boolean)(val);
    return false;
  });

  const data = !config.data ? true : (
    Object.entries(config.data) as [keyof T, true | T[keyof T][] | ((v: any) => boolean)][]
  ).every(([field, cond]) => {
    const val = args.data?.[field];
    if (cond === true) return val !== undefined;
    if (cond === val) return true;
    if (Array.isArray(cond)) return cond.includes(val);
    if (typeof cond === 'function') return (cond as (v: any) => boolean)(val);
    return false;
  });

  return where && data;
}

/**
 * Execute local listeners for a model
 * @param source - Indicates whether the event is 'local' or 'remote'
 */
export async function executeLocalListeners<T>(
  model: ModelNames,
  args: any,
  result: T,
  source: 'local' | 'remote' = 'local'
): Promise<void> {
  const configs = listeners[model];
  if (!configs) return;

  for (const cfg of configs) {
    // Skip if remoteOnly is true and source is local
    if (cfg.remoteOnly && source === 'local') {
      continue;
    }
    
    if (matches(cfg, args)) {
      try {
        await cfg.listener({ args, model, result, source });
      } catch (err) {
        logger.error(`Listener for ${model} failed`, err);
      }
    }
  }
}
