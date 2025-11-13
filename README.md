# Prisma Extension Emitter

[![npm version](https://img.shields.io/npm/v/prisma-extension-emitter)](https://www.npmjs.com/package/prisma-extension-emittern)
[![npm downloads](https://img.shields.io/npm/dm/prisma-extension-emitter)](https://www.npmjs.com/package/prisma-extension-emitter)
[![license](https://img.shields.io/npm/l/prisma-extension-emitter)](https://github.com/feggaa/prisma-extension-emitter/blob/main/LICENSE)

**Version 2.1.10**

A lightweight Prisma extension for registering conditional listeners and emitting events on any model's CRUD operations.

## Features

- ✅ **Event Listeners**: Register conditional listeners for Prisma operations
- ✅ **Local Events**: Process events in the same application
- ✅ **Remote Listeners**: Listen to events from other servers with `allowRemote: true` ⭐
- ✅ **Remote-Only Listeners**: Process only MQTT events with `remoteOnly: true` 🆕
- ✅ **Event Source Tracking**: Know if events are local or remote with `source` parameter 🆕
- ✅ **Automatic Deduplication**: Prevents duplicate event processing automatically 🆕
- ✅ **MQTT Support**: Distributed events across servers - **zero MQTT code required!** 🚀
- ✅ **Granular Emit Control**: Control local and remote emission independently 🆕
- ✅ **Flexible Filtering**: Filter events by `where` and `data` conditions
- ✅ **TypeScript Support**: Full type safety with generated types
- ✅ **Per-Operation Control**: Enable/disable emit per operation type

## Prerequisites

- Node.js ≥ 16
- prisma v4.16.0 or higher
- @prisma/client

## Installation

```bash
npm install prisma-extension-emitter
```

> **Note:** Supports `create`, `update`, `updateMany`, and `upsert` operations.

## Usage

```ts
import { PrismaClient } from "@prisma/client";
import {
  listenerExtensionConfig,
  prismaEventListener,
} from "prisma-extension-emitter";

// 1) Extend the Prisma client with emit enabled
export const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: true, // Enable events on all operations
  })
);

// 2) Register a listener
prismaEventListener("User", {
  where: { id: 1 },
  data: { status: ["ACTIVE", "BLOCKED"] },
  listener: async ({ result, source }) => {
    console.log(`User #${result.id} → status ${result.status} (${source})`);
  },
});

// 3) Trigger events by setting `emit: true`
await prisma.user.update({
  where: { id: 1 },
  data: { status: "ACTIVE" },
  emit: true, // <– Triggers listeners
});
```

### Granular Emit Control

Control local and remote event emission independently:

```ts
// Option 1: Enable all operations (both local and remote)
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: true, // Enables create, update, updateMany, upsert
  })
);

// Option 2: Enable specific operations
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: {
      emitOnCreate: true,
      emitOnUpdate: true,
      emitOnUpdateMany: false, // Disabled
      emitOnUpsert: true,
    },
  })
);

// Option 3: Control local vs remote emission per operation (NEW!)
await prisma.user.create({
  data: { email: "user@example.com" },
  emit: { local: true, remote: false }, // Only local listeners, no MQTT
});

await prisma.log.create({
  data: { message: "Event" },
  emit: { local: false, remote: true }, // Only MQTT, skip local listeners
});
```

## Examples

**Matching data only** — listen on users with **ACTIVE** only

```ts
prismaEventListener("User", {
  data: { status: "ACTIVE" },
  listener: async ({ result, source }) => {
    console.log("User #" + result.id + " status changed to " + result.status);
    console.log("Event source:", source); // 'local' or 'remote'
  },
});
```

**Any status** — listen to all users regardless of status

```ts
prismaEventListener("User", {
  data: { status: true },
  listener: async ({ result, source }) => {
    console.log("User #" + result.id + " status changed to " + result.status);
  },
});
```

**Multiple statuses** — listen to **ACTIVE** or **BLOCKED**

```ts
prismaEventListener("User", {
  data: { status: ["ACTIVE", "BLOCKED"] },
  listener: async ({ result, source }) => {
    console.log("User #" + result.id + " status changed to " + result.status);
  },
});
```

### `prismaEventListener(modelName, config)`

Registers a conditional listener:

- `modelName: string` – the Prisma model (e.g., `'User'`).
- `config.operation?: string | string[]` – optional operation filter ('create', 'update', 'updateMany', 'upsert').
- `config.where?: object` – optional `where` filter (string, array, boolean, or predicate callback).
- `config.data?: object` – optional `data` filter (string, array, boolean, or predicate callback).
- `config.remoteOnly?: boolean` 🆕 – if `true`, only triggers for remote MQTT events (default: `false`).
- `config.listener: (args: { result: any, operation: string, source: 'local' | 'remote' }) => void` – callback invoked when conditions match.

The listener receives:

- `result` – the operation result data
- `operation` – the operation type ('create', 'update', 'updateMany', 'upsert')
- `source` 🆕 – event origin: `'local'` for same-process events, `'remote'` for MQTT events

## CLI: Generate Emit Types

To annotate all CRUD args with `emit?: boolean | { local: boolean; remote: boolean }`, run:

```bash
npx prisma-emitter generate \
  --schema=./prisma/schema.prisma \
  --output=./types
```

Then include the generated `types/prisma-emit.d.ts` in your `tsconfig.json` so TypeScript picks it up.

## MQTT Event Publishing

**🚀 Zero MQTT Code Required!**

Just provide configuration - the extension handles all MQTT operations automatically:

- ✅ Connects to MQTT broker
- ✅ Publishes events when `emit: true`
- ✅ Subscribes to topics when `allowRemote: true`
- ✅ Handles reconnection and errors
- ✅ Manages subscription lifecycle

Perfect for:

- Synchronizing events across multiple servers
- Microservices communication
- Real-time notifications
- Distributed cache invalidation
- Cross-region deployments

### Quick Start with MQTT

**2. Add MQTT configuration (that's all the MQTT code you write!):**

```ts
import { PrismaClient } from "@prisma/client";
import { listenerExtensionConfig } from "prisma-extension-emitter";

const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: true, // Enable events
    mqtt: {
      enabled: true,
      brokerUrl: "mqtt://localhost:1883",
      topicPrefix: "myapp/events", // Optional
      options: {
        clientId: "server-1",
        username: "your-username", // Optional
        password: "your-password", // Optional
      },
    },
  })
);

// That's it! No MQTT code needed.
// Events are now published automatically when emit: true
await prisma.user.create({
  data: { name: "Alice" },
  emit: true,
});
// ✅ Publishes to: myapp/events/user/create
// ✅ Local listeners execute
// ✅ All handled by the extension!
```

## Remote Listeners

**✨ Listen to events from ALL servers - zero MQTT code required!**

Just add `allowRemote: true` to your listener and the extension automatically:

- Subscribes to MQTT topics
- Receives events from other servers
- Executes your listener for remote events
- Handles all MQTT operations internally

```typescript
import { PrismaClient } from "@prisma/client";
import {
  listenerExtensionConfig,
  prismaEventListener,
} from "prisma-extension-emitter";

// 1. Configure MQTT (one-time setup)
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: true,
    mqtt: {
      enabled: true,
      brokerUrl: "mqtt://localhost:1883",
    },
  })
);

// 2. Register a remote listener (extension subscribes to MQTT automatically)
prismaEventListener("user", {
  allowRemote: true, // ← Extension handles MQTT subscription!
  listener: async ({ result, source }) => {
    // Runs on ALL servers when ANY server creates a user
    console.log("User created:", result.id);
    console.log("Event from:", source); // 'local' or 'remote'
    cache.invalidate(`user:${result.id}`);
  },
});

// 3. Register a remote-only listener (only triggers from MQTT) 🆕
prismaEventListener("user", {
  allowRemote: true,
  remoteOnly: true, // ← Only processes remote events
  listener: async ({ result, source }) => {
    // Only runs on servers that didn't originate the event
    console.log("Remote user created:", result.id);
    console.log("Source:", source); // Always 'remote'
    // Useful for cache invalidation without double-processing
    cache.invalidate(`user:${result.id}`);
  },
});

// 4. Create a user on Server 1
await prisma.user.create({
  data: { name: "Alice" },
  emit: true,
});

// Result with remoteOnly: false (default):
// ✅ Server 1: Listener executes with source='local'
// ✅ Server 2, 3, 4...: Listener executes with source='remote'

// Result with remoteOnly: true:
// ❌ Server 1: Listener skipped (local event)
// ✅ Server 2, 3, 4...: Listener executes with source='remote'

// ✅ All MQTT operations handled by extension!
// ✅ Automatic deduplication prevents duplicate processing!
```

**Perfect for:**

- 🔄 Cache invalidation across servers
- 📢 Real-time notifications
- 📊 Analytics collection from all servers
- 🌍 Multi-region synchronization
- 🎯 Remote-only event processing 🆕

**Features:**

- ✅ **Automatic Deduplication** 🆕 - Events are never processed twice (5-second TTL)
- ✅ **Source Tracking** 🆕 - Know if events are local or remote
- ✅ **Remote-Only Filtering** 🆕 - Skip local events, process only remote
- ✅ **No MQTT code needed** - Just configuration + `allowRemote: true`!

## CLI Tool

Generate TypeScript types for the `emit` parameter:

```bash
npx prisma-emitter generate --schema=./prisma/schema.prisma --output=./types
```

**Options:**

- `--schema, -s`: Path to Prisma schema (default: `prisma/schema.prisma`)
- `--output, -o`: Output directory for generated types (default: `types`)
- `--version, -v`: Show version
- `--help, -h`: Show help

This generates type augmentations so TypeScript knows about `emit?: boolean | { local: boolean; remote: boolean }` on Prisma operations.

## Advanced Examples

### Remote-Only Cache Invalidation

```typescript
// Only invalidate caches on OTHER servers (not the originating server)
prismaEventListener("Product", {
  operation: "update",
  allowRemote: true,
  remoteOnly: true, // Skip local processing
  listener: async ({ result, source }) => {
    // Only runs on remote servers
    console.log("Invalidating product cache on remote server");
    await cache.delete(`product:${result.id}`);
  },
});
```

### Source-Based Processing

```typescript
// Different behavior based on event source
prismaEventListener("Order", {
  operation: "create",
  allowRemote: true,
  listener: async ({ result, source }) => {
    if (source === "local") {
      // Send confirmation email only from originating server
      await sendOrderConfirmation(result.email);
    }

    // Update analytics on all servers
    await analytics.track("order_created", result.id);
  },
});
```

### Granular Emit Control

```typescript
// Scenario 1: Notify local + remote servers
await prisma.user.create({
  data: { name: "Alice" },
  emit: true, // Both local listeners + MQTT
});

// Scenario 2: Only update local caches
await prisma.product.update({
  where: { id: 1 },
  data: { stock: 100 },
  emit: { local: true, remote: false }, // Local only
});

// Scenario 3: Only notify remote servers
await prisma.log.create({
  data: { message: "Event" },
  emit: { local: false, remote: true }, // MQTT only
});

// Scenario 4: Silent operation (no events)
await prisma.setting.update({
  where: { key: "theme" },
  data: { value: "dark" },
  emit: false, // No listeners, no MQTT
});
```

**Note:** CLI is only for TypeScript type generation - not required for runtime.

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: Detailed architecture and how everything works
- **[examples/](./examples)**: Working code examples

## Examples

Check out the [examples](./examples) directory for:

- Simple MQTT integration
- Multi-server architecture
- Remote listeners with `allowRemote`
- Microservices communication
- Event-driven patterns

## Key Benefits

✅ **Zero MQTT Boilerplate**: Just configuration, extension handles everything  
✅ **Type-Safe**: Full TypeScript support with generated types  
✅ **Flexible**: Enable emit globally or per-operation  
✅ **Production-Ready**: Built-in error handling and reconnection  
✅ **Developer-Friendly**: Minimal setup, maximum functionality
