import { ExtensionOptions, EmitConfig } from './types';
import { initializeMqtt } from './mqtt';
import { runListeners } from './runner';
import { logger } from './logger';

/**
 * Parse emit configuration from args
 */
function parseEmitConfig(emit: EmitConfig | undefined): { shouldEmit: boolean; local: boolean; remote: boolean } {
  if (!emit) {
    return { shouldEmit: false, local: false, remote: false };
  }
  
  if (typeof emit === 'boolean') {
    return { shouldEmit: emit, local: emit, remote: emit };
  }
  
  return { 
    shouldEmit: emit.local || emit.remote, 
    local: emit.local ?? false, 
    remote: emit.remote ?? false 
  };
}

/**
 * Create Prisma extension configuration
 */
export function listenerExtensionConfig(options?: ExtensionOptions) {
  // Set log level (default: 'none')
  logger.setLevel(options?.logLevel ?? 'none');
  
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

  // Add update method
  (extensionConfig.query!.$allModels as any).update = async function({ 
    args, 
    query, 
    model 
  }: any) {
    if (!('emit' in args) && !emitConfig.emitOnUpdate) return query(args);
    const emitOpts = parseEmitConfig((args as any).emit);
    delete (args as any).emit;
    const result = await query(args);
    if (emitOpts.shouldEmit) {
      runListeners(model, args, result, 'update', { local: emitOpts.local, remote: emitOpts.remote });
    }
    return result;
  };

  // Add updateMany method
  (extensionConfig.query!.$allModels as any).updateMany = async function({ 
    args, 
    query, 
    model 
  }: any) {
    if (!('emit' in args) && !emitConfig.emitOnUpdateMany) return query(args);
    const emitOpts = parseEmitConfig((args as any).emit);
    delete (args as any).emit;
    const result = await query(args);
    if (emitOpts.shouldEmit) {
      runListeners(model, args, result, 'updateMany', { local: emitOpts.local, remote: emitOpts.remote });
    }
    return result;
  };

  // Add create method
  (extensionConfig.query!.$allModels as any).create = async function({ 
    args, 
    query, 
    model 
  }: any) {
    if (!('emit' in args) && !emitConfig.emitOnCreate) return query(args);
    const emitOpts = parseEmitConfig((args as any).emit);
    delete (args as any).emit;
    const result = await query(args);
    if (emitOpts.shouldEmit) {
      runListeners(model, args, result, 'create', { local: emitOpts.local, remote: emitOpts.remote });
    }
    return result;
  };

  // Add upsert method
  (extensionConfig.query!.$allModels as any).upsert = async function({ 
    args, 
    query, 
    model 
  }: any) {
    if (!('emit' in args) && !emitConfig.emitOnUpsert) return query(args);
    const emitOpts = parseEmitConfig((args as any).emit);
    delete (args as any).emit;
    const result = await query(args);
    if (emitOpts.shouldEmit) {
      runListeners(model, args, result, 'upsert', { local: emitOpts.local, remote: emitOpts.remote });
    }
    return result;
  };

  return extensionConfig;
}
