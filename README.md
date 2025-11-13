# Prisma Extension Emitter

[![npm version](https://img.shields.io/npm/v/prisma-extension-emitter)](https://www.npmjs.com/package/prisma-extension-emittern)
[![npm downloads](https://img.shields.io/npm/dm/prisma-extension-emitter)](https://www.npmjs.com/package/prisma-extension-emitter)
[![license](https://img.shields.io/npm/l/prisma-extension-emitter)](https://github.com/feggaa/prisma-extension-emitter/blob/main/LICENSE)

**Version 2.1.9**

A lightweight Prisma extension for registering conditional listeners and emitting events on any model's CRUD operations.

## Features

- ✅ **Event Listeners**: Register conditional listeners for Prisma operations
- ✅ **Local Events**: Process events in the same application
- ✅ **Remote Listeners**: Listen to events from other servers with `allowRemote: true` ⭐
- ✅ **MQTT Support**: Distributed events across servers - **zero MQTT code required!** 🚀
- ✅ **Flexible Filtering**: Filter events by `where` and `data` conditions
- ✅ **TypeScript Support**: Full type safety with generated types
- ✅ **Granular Control**: Enable/disable emit per operation type

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
  listener: async ({ result }) => {
    console.log(`User #${result.id} → status ${result.status}`);
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

Enable emit globally or per operation:

```ts
// Option 1: Enable all operations
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
```

## Examples

**Matching data only** — list on users with **ACTIVE** only

```ts
prismaEventListener("User", {
  data: { status: "ACTIVE" },
  listener: async ({ result }) => {
    console.log("User #" + result.id + " status changed to " + result.status);
  },
});
```

**Any status** — listen to all users regardless of status

```ts
prismaEventListener("User", {
  data: { status: true },
  listener: async ({ result }) => {
    console.log("User #" + result.id + " status changed to " + result.status);
  },
});
```

**Multiple statuses** — listen to **ACTIVE** or **BLOCKED**

```ts
prismaEventListener("User", {
  data: { status: ["ACTIVE", "BLOCKED"] },
  listener: async ({ result }) => {
    console.log("User #" + result.id + " status changed to " + result.status);
  },
});
```

### `prismaEventListener(modelName, config)`

Registers a conditional listener:

- `modelName: string` – the Prisma model (e.g., `'User'`).
- `config.where?: object` – optional `where` filter (string, array, boolean, or predicate callback).
- `config.data?: object` – optional `data` filter (string, array, boolean, or predicate callback).
- `config.listener: (args: { result: any }) => void` – callback invoked when conditions match.
- `config.allowRemote?:boolean` optional - listener handle remote events

## CLI: Generate Emit Types

To annotate all CRUD args with `emit?: boolean`, run:

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
  listener: async ({ result }) => {
    // Runs on ALL servers when ANY server creates a user
    console.log("User created:", result.id);
    cache.invalidate(`user:${result.id}`);
  },
});

// 3. Create a user on Server 1
await prisma.user.create({
  data: { name: "Alice" },
  emit: true,
});

// Result:
// ✅ Server 1: Listener executes (local event)
// ✅ Server 2, 3, 4...: Listener executes (remote via MQTT)
// ✅ All MQTT operations handled by extension!
```

**Perfect for:**

- 🔄 Cache invalidation across servers
- 📢 Real-time notifications
- 📊 Analytics collection from all servers
- 🌍 Multi-region synchronization

**No MQTT code needed - just configuration + `allowRemote: true`!**

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

This generates type augmentations so TypeScript knows about `emit?: boolean` on Prisma operations.

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
