# Architecture Overview

**Version 2.0.7**

## Zero MQTT Code Required

🎯 **Key Feature**: Users only provide MQTT configuration - no MQTT code needed!

The extension automatically:

- ✅ Connects to MQTT broker
- ✅ Publishes events when `emit: true`
- ✅ Subscribes to topics when `allowRemote: true`
- ✅ Handles reconnection and error recovery
- ✅ Manages subscriptions lifecycle

**User's only job**: Pass configuration to the extension.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         MQTT Broker                              │
│                    (mqtt://localhost:1883)                       │
└─────────────────────────────────────────────────────────────────┘
           ↑                    ↑                    ↑
    Publish│              Subscribe              Subscribe
           │                    │                    │
           │                    ↓                    ↓
┌──────────┴────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Server 1        │  │   Server 2       │  │   Server 3       │
│   (API Server)    │  │   (API Server)   │  │ (Analytics)      │
├───────────────────┤  ├──────────────────┤  ├──────────────────┤
│                   │  │                  │  │                  │
│ Prisma Extension  │  │ Prisma Extension │  │ Prisma Extension │
│ ┌───────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │
│ │ Publisher     │ │  │ │ Subscriber   │ │  │ │ Subscriber   │ │
│ │ Client        │ │  │ │ Client       │ │  │ │ Client       │ │
│ └───────────────┘ │  │ └──────────────┘ │  │ └──────────────┘ │
│         │         │  │        │         │  │        │         │
│         ↓         │  │        ↓         │  │        ↓         │
│ ┌───────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │
│ │Local Listeners│ │  │ │allowRemote   │ │  │ │allowRemote   │ │
│ │               │ │  │ │listeners     │ │  │ │listeners     │ │
│ └───────────────┘ │  │ └──────────────┘ │  │ └──────────────┘ │
│                   │  │                  │  │                  │
│ prisma.user       │  │                  │  │                  │
│ .create()         │  │                  │  │                  │
│   ↓               │  │                  │  │                  │
│ emit: true        │  │                  │  │                  │
└───────────────────┘  └──────────────────┘  └──────────────────┘
```

## Event Flow

### 1. User Creates Record on Server 1

```typescript
// Server 1
await prisma.user.create({
  data: { name: "Alice" },
  emit: true, // ← Triggers events
});
```

### 2. Local Execution (Server 1)

```
Server 1 Flow:
┌──────────────┐
│ create()     │
│ emit: true   │
└──────┬───────┘
       ↓
┌──────────────┐
│runListeners()│
└──────┬───────┘
       ↓
┌──────────────────┐
│Local Listeners   │ ← Executes immediately
│Execute           │
└──────────────────┘
```

### 3. MQTT Publishing (Server 1)

```
Server 1 Flow:
┌──────────────┐
│runListeners()│
└──────┬───────┘
       ↓
┌──────────────┐
│publishToMqtt()│
└──────┬───────┘
       ↓
┌──────────────────────┐
│ MQTT Broker          │
│ Topic:               │
│ prisma/events/user/  │
│        create        │
│                      │
│ Payload:             │
│ {                    │
│   model: "user",     │
│   operation:"create",│
│   result: {...}      │
│ }                    │
└──────────────────────┘
```

### 4. Remote Execution (Server 2, 3, etc.)

```
Server 2 & 3 Flow:
┌──────────────────────┐
│ MQTT Broker          │
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Subscriber Client    │
│ receives message     │
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│handleMqttMessage()   │
│ parses JSON          │
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Find listeners with  │
│ allowRemote: true    │
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Apply filters        │
│ (where, data)        │
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Execute listeners    │ ← Remote execution!
└──────────────────────┘
```

## Listener Types

### Local Only (Default)

```typescript
prismaEventListener("user", {
  // allowRemote not set
  listener: async ({ result }) => {
    // Runs ONLY on the server that created the user
    console.log("Local event");
  },
});
```

```
Server 1: Creates user → Listener executes ✓
Server 2:                 Listener SKIPPED ✗
Server 3:                 Listener SKIPPED ✗
```

### Remote (allowRemote: true)

```typescript
prismaEventListener("user", {
  allowRemote: true, // ← Listen to all servers
  listener: async ({ result }) => {
    // Runs on ALL servers
    console.log("Event from any server");
  },
});
```

```
Server 1: Creates user → Listener executes ✓ (local)
Server 2:                 Listener executes ✓ (remote via MQTT)
Server 3:                 Listener executes ✓ (remote via MQTT)
```

## Client Architecture

### Publisher Client

```
┌─────────────────────────┐
│ mqttClient              │
│ (Publisher)             │
├─────────────────────────┤
│ Role: Publish events    │
│ When: emit: true        │
│ Topics: Publishes to    │
│  {prefix}/{model}/{op}  │
│                         │
│ QoS: 1                  │
│ ClientID: server-1      │
└─────────────────────────┘
```

### Subscriber Client

```
┌─────────────────────────┐
│ mqttSubscriber          │
│ (Subscriber)            │
├─────────────────────────┤
│ Role: Receive events    │
│ When: allowRemote:true  │
│ Topics: Subscribes to   │
│  {prefix}/{model}/#     │
│                         │
│ Auto-managed            │
│ ClientID: server-1-     │
│           subscriber    │
└─────────────────────────┘
```

### Why Two Clients?

✅ **Separation of Concerns**: Publish and subscribe independently  
✅ **No Message Loops**: Subscriber has different ID  
✅ **Better Reliability**: One failure doesn't affect the other  
✅ **Cleaner Code**: Each client has single responsibility

## Subscription Management

### Smart Subscription Sharing

```
Multiple listeners to same model:

prismaEventListener('user', { allowRemote: true, ... }); ─┐
                                                          │
prismaEventListener('user', { allowRemote: true, ... }); ─┤─→ ONE subscription
                                                          │   to MQTT topic:
prismaEventListener('user', { allowRemote: true, ... }); ─┘   prisma/events/user/#
```

### Auto-Cleanup

```
When last listener unsubscribes:

Listener 1: unsubscribe() ─┐
Listener 2: unsubscribe() ─┤─→ mqttSubscriptions.size === 0
Listener 3: unsubscribe() ─┘        ↓
                                    ↓
                            MQTT topic unsubscribed
                            Topic removed from map
```

## Topic Structure

```
{topicPrefix}/{modelName}/{operation}

Examples:
├── prisma/events/user/create
├── prisma/events/user/update
├── prisma/events/user/updateMany
├── prisma/events/user/upsert
├── prisma/events/order/create
└── prisma/events/product/update
```

### Wildcard Subscriptions

When `allowRemote: true` for a model:

```
Subscribes to: prisma/events/user/#

Receives:
✓ prisma/events/user/create
✓ prisma/events/user/update
✓ prisma/events/user/updateMany
✓ prisma/events/user/upsert
```

## Message Format

```json
{
  "model": "user",
  "operation": "create",
  "args": {
    "data": {
      "name": "Alice",
      "email": "alice@example.com"
    }
  },
  "result": {
    "id": 1,
    "name": "Alice",
    "email": "alice@example.com",
    "createdAt": "2025-11-13T10:30:00.000Z"
  },
  "timestamp": "2025-11-13T10:30:00.123Z"
}
```

## Error Handling

### MQTT Publish Failure

```
prisma.user.create({ emit: true })
    ↓
Local listeners execute ✓
    ↓
MQTT publish fails ✗
    ↓
Error logged to console
    ↓
Database operation succeeds ✓
```

**Result**: Local processing continues, MQTT failure is logged but doesn't throw

### MQTT Subscription Failure

```
prismaEventListener({ allowRemote: true })
    ↓
Subscribe to MQTT topic
    ↓
Subscription fails ✗
    ↓
Error logged to console
    ↓
Local listener still registered ✓
```

**Result**: Local events still work, remote events won't be received

## Configuration Levels

### Minimal (Just Add Config)

```typescript
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: true, // Enable events on all operations
    mqtt: {
      enabled: true,
      brokerUrl: "mqtt://localhost:1883",
    },
  })
);

// That's it! No MQTT code needed.
// The extension handles everything automatically.
```

### Recommended (With Topic Prefix & Auth)

```typescript
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: true,
    mqtt: {
      enabled: true,
      brokerUrl: "mqtt://broker:1883",
      topicPrefix: "myapp/events",
      options: {
        clientId: "server-1",
        username: "user",
        password: "pass",
      },
    },
  })
);

// Extension automatically:
// - Connects both publisher and subscriber clients
// - Publishes events when emit: true
// - Subscribes when allowRemote: true listeners exist
```

### Production (Secure & Environment-Based)

```typescript
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: {
      emitOnCreate: true,
      emitOnUpdate: true,
      emitOnUpdateMany: true,
      emitOnUpsert: true,
    },
    mqtt: {
      enabled: true,
      brokerUrl: "mqtts://broker:8883",
      topicPrefix: "prod/events",
      options: {
        clientId: `server-${process.env.SERVER_ID}`,
        username: process.env.MQTT_USER,
        password: process.env.MQTT_PASS,
        clean: true,
        reconnectPeriod: 5000,
        keepalive: 60,
      },
    },
  })
);

// All MQTT operations handled internally by the extension
```

### Granular Emit Control

You can enable/disable emit per operation:

```typescript
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: {
      emitOnCreate: true, // Enable for create
      emitOnUpdate: true, // Enable for update
      emitOnUpdateMany: false, // Disable for updateMany
      emitOnUpsert: true, // Enable for upsert
    },
    mqtt: {
      /* ... */
    },
  })
);
```

Or enable all at once:

```typescript
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: true, // Enables all: create, update, updateMany, upsert
    mqtt: {
      /* ... */
    },
  })
);
```

## Performance

### Optimizations

✅ **Shared Subscriptions**: One MQTT sub per model  
✅ **Async Publishing**: Non-blocking event publish  
✅ **Parallel Execution**: Local and MQTT run concurrently  
✅ **Smart Filtering**: Filters applied before execution  
✅ **Connection Reuse**: Persistent MQTT connections

### Benchmarks (Typical)

```
Local event execution:     <1ms
MQTT publish:              1-5ms (async, non-blocking)
Remote event reception:    5-20ms (network latency)
Remote listener execution: <1ms

Total overhead: ~5-20ms for remote events
```

## Use Case Examples

### 1. Cache Invalidation (No MQTT Code!)

**Configuration:**

```typescript
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: true,
    mqtt: {
      enabled: true,
      brokerUrl: "mqtt://cache-broker:1883",
    },
  })
);
```

**Listener (runs on all servers):**

```typescript
prismaEventListener("product", {
  allowRemote: true, // ← Automatically subscribes to MQTT
  listener: async ({ result }) => {
    cache.invalidate(`product:${result.id}`);
  },
});
```

**Trigger:**

```typescript
// Server 1: Updates product
await prisma.product.update({
  where: { id: 1 },
  data: { price: 99.99 },
  emit: true, // ← Automatically publishes to MQTT
});
```

**Flow:**

```
Server 1: Updates product
    ↓
Local cache invalidated (Server 1)
    ↓
Extension auto-publishes to MQTT
    ↓
Extension auto-receives on Server 2, 3, 4
    ↓
Remote cache invalidated (Server 2, 3, 4)
    ↓
Result: All caches synchronized (no MQTT code written!)
```

### 2. Real-Time Notifications

**Configuration:**

```typescript
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: { emitOnCreate: true },
    mqtt: {
      enabled: true,
      brokerUrl: "mqtt://notifications:1883",
      topicPrefix: "app/events",
    },
  })
);
```

**Listener:**

```typescript
prismaEventListener("order", {
  allowRemote: true,
  data: { status: "COMPLETED" },
  listener: async ({ result }) => {
    await sendEmail(result.userEmail, "Order completed!");
    await sendPushNotification(result.userId);
  },
});
```

**Flow:**

```
Server 1: Order completed
    ↓
Extension publishes to MQTT automatically
    ↓
Notification server receives via extension
    ↓
Email sent to customer
    ↓
Push notification sent
```

### 3. Multi-Region Sync

**Configuration (same on all regions):**

```typescript
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: true,
    mqtt: {
      enabled: true,
      brokerUrl: "mqtt://global-broker:1883",
      topicPrefix: "global/events",
      options: {
        clientId: `region-${process.env.REGION}`,
      },
    },
  })
);
```

**Listener:**

```typescript
prismaEventListener("user", {
  allowRemote: true,
  listener: async ({ result }) => {
    // Sync to local database replica
    await syncToLocalDB(result);
  },
});
```

**Flow:**

```
US Server: Creates user → emit: true
    ↓
Extension publishes to MQTT (no code needed)
    ↓
Extension receives on EU Server (automatic)
    ↓
Extension receives on Asia Server (automatic)
    ↓
Listeners execute on all regions
    ↓
Result: User available in all regions
```

## CLI Tool: Type Generation

Generate TypeScript types for `emit` parameter:

```bash
npx prisma-emitter generate --schema=./prisma/schema.prisma --output=./types
```

This generates type augmentations so TypeScript knows about the `emit?: boolean` parameter on Prisma operations.

**No CLI required for runtime** - only for TypeScript type safety.

---

## Summary

This architecture provides a robust, scalable solution for distributed event-driven systems with:

- **Zero MQTT boilerplate**: Just configuration, no MQTT code
- **Automatic connection management**: Extension handles all MQTT operations
- **Type-safe events**: Optional CLI for TypeScript type generation
- **Flexible emit control**: Enable per-operation or globally
- **Smart subscriptions**: Automatic topic management based on `allowRemote`
- **Production-ready**: Built-in error handling and reconnection

**User writes**: Configuration + Listeners  
**Extension handles**: All MQTT publish/subscribe operations
