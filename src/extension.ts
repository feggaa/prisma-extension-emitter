import { ExtensionOptions } from './types';
import { initializeMqtt } from './mqtt';
import { runListeners } from './runner';

/**
 * Create Prisma extension configuration
 */
export function listenerExtensionConfig(options?: ExtensionOptions) {
  // Initialize MQTT if configured
  if (options?.mqtt) {
    initializeMqtt(options.mqtt);
  }
  
  // Determine emit configuration
  const emitConfig = typeof options?.emit === 'boolean' 
    ? {
        emitOnCreate: options.emit,
        emitOnUpdate: options.emit,
        emitOnUpdateMany: options.emit,
        emitOnUpsert: options.emit
      }
    : {
        emitOnCreate: options?.emit?.emitOnCreate ?? false,
        emitOnUpdate: options?.emit?.emitOnUpdate ?? false,
        emitOnUpdateMany: options?.emit?.emitOnUpdateMany ?? false,
        emitOnUpsert: options?.emit?.emitOnUpsert ?? false
      };

  const extensionConfig: any = {
    name: 'listenerExtension',
    query: {
      $allModels: {} as any,
    },
  };

  // Add update method if enabled
  if (emitConfig.emitOnUpdate) {
    (extensionConfig.query!.$allModels as any).update = async function({ 
      args, 
      query, 
      model 
    }: any) {
      const doEmit = Boolean((args as any).emit);
      delete (args as any).emit;
      const result = await query(args);
      if (doEmit) await runListeners(model, args, result, 'update');
      return result;
    };
  }

  // Add updateMany method if enabled
  if (emitConfig.emitOnUpdateMany) {
    (extensionConfig.query!.$allModels as any).updateMany = async function({ 
      args, 
      query, 
      model 
    }: any) {
      const doEmit = Boolean((args as any).emit);
      delete (args as any).emit;
      const result = await query(args);
      if (doEmit) await runListeners(model, args, result, 'updateMany');
      return result;
    };
  }

  // Add create method if enabled
  if (emitConfig.emitOnCreate) {
    (extensionConfig.query!.$allModels as any).create = async function({ 
      args, 
      query, 
      model 
    }: any) {
      const doEmit = Boolean((args as any).emit);
      delete (args as any).emit;
      const result = await query(args);
      if (doEmit) await runListeners(model, args, result, 'create');
      return result;
    };
  }

  // Add upsert method if enabled
  if (emitConfig.emitOnUpsert) {
    (extensionConfig.query!.$allModels as any).upsert = async function({ 
      args, 
      query, 
      model 
    }: any) {
      const doEmit = Boolean((args as any).emit);
      delete (args as any).emit;
      const result = await query(args);
      if (doEmit) await runListeners(model, args, result, 'upsert');
      return result;
    };
  }

  return extensionConfig;
}
