# Architecture Overview

**Version 2.1.12**

## Zero MQTT Code Required

🎯 **Key Feature**: Users only provide MQTT configuration - no MQTT code needed!

The extension automatically:

- ✅ Connects to MQTT broker
- ✅ Publishes events when `emit: true`
- ✅ Subscribes to topics when `allowRemote: true`
- ✅ Handles reconnection and error recovery
- ✅ Manages subscriptions lifecycle
- ✅ Tracks event sources (local vs remote)
- ✅ Prevents duplicate event processing
- ✅ Supports remote-only listeners

**User's only job**: Pass configuration to the extension.

## How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│                         MQTT Broker                              │
│                    (mqtt://localhost:1883)                       │
└──────────────────────────────────────────────────────────────────┘
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
┌────────────────────────┐
│executeLocalListeners() │
│ source: 'local'        │ ← NEW: Pass source parameter
└──────┬─────────────────┘
       ↓
┌────────────────────────┐
│ Filter by remoteOnly   │ ← NEW: Skip if remoteOnly=true
└──────┬─────────────────┘
       ↓
┌────────────────────────┐
│ Local Listeners        │
│ Execute with           │
│ { result, source }     │ ← NEW: Include source in payload
└────────────────────────┘
```

### 3. MQTT Publishing (Server 1)

```
Server 1 Flow:
┌──────────────┐
│runListeners()│
└──────┬───────┘
       ↓
┌──────────────────────┐
│publishToMqtt()       │
│ Generate eventId     │ ← NEW: Create unique event ID
│ markAsProcessed()    │ ← NEW: Store in local cache
└──────┬───────────────┘
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
│   result: {...},     │
│   eventId: "abc123"  │ ← NEW: Include event ID
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
│ extracts eventId     │ ← NEW: Get event ID
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Check deduplication  │ ← NEW: Was processed locally?
│ wasProcessedLocally? │
└──────┬───────────────┘
       ↓ (if not duplicate)
┌──────────────────────┐
│ Find listeners with  │
│ allowRemote: true    │
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Filter by remoteOnly │ ← NEW: Check remoteOnly flag
│ (skip if local event)│
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Apply filters        │
│ (where, data)        │
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Execute listeners    │ ← Remote execution!
│ with source='remote' │    NEW: Pass source parameter
└──────────────────────┘
```

## Listener Types

### Local Only (Default)

```typescript
prismaEventListener("user", {
  // allowRemote not set
  listener: async ({ result, source }) => {
    // Runs ONLY on the server that created the user
    console.log("Local event, source:", source); // 'local'
  },
});
```

```
Server 1: Creates user → Listener executes ✓ (source: 'local')
Server 2:                 Listener SKIPPED ✗
Server 3:                 Listener SKIPPED ✗
```

### Remote-Capable (allowRemote: true)

```typescript
prismaEventListener("user", {
  allowRemote: true, // ← Listen to all servers
  listener: async ({ result, source }) => {
    // Runs on ALL servers
    console.log("Event from:", source); // 'local' or 'remote'
  },
});
```

```
Server 1: Creates user → Listener executes ✓ (source: 'local')
Server 2:                 Listener executes ✓ (source: 'remote' via MQTT)
Server 3:                 Listener executes ✓ (source: 'remote' via MQTT)
```

### Remote-Only (NEW in v2.1.11!)

```typescript
prismaEventListener("user", {
  allowRemote: true,
  remoteOnly: true, // ← Only execute for MQTT events
  listener: async ({ result, source }) => {
    // Runs ONLY on remote servers (not on the server that created the user)
    console.log("Remote event only, source:", source); // Always 'remote'
  },
});
```

```
Server 1: Creates user → Listener SKIPPED ✗ (local event ignored)
Server 2:                 Listener executes ✓ (source: 'remote' via MQTT)
Server 3:                 Listener executes ✓ (source: 'remote' via MQTT)
```

**Use Cases for `remoteOnly: true`:**

- ✅ Sync data FROM other servers (avoid double-processing)
- ✅ Aggregate analytics from other services only
- ✅ Cross-region replication (don't replicate to self)
- ✅ Prevent local/remote duplicate processing

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
  "timestamp": "2025-11-13T10:30:00.123Z",
  "eventId": "dGhpc2lzYXVuaXF1ZWV2ZW50aWQ=" // NEW: For deduplication
}
```

### Event ID Generation (NEW in v2.1.11!)

The `eventId` is automatically generated for each event:

```typescript
function generateEventId(model, operation, args, result) {
  const data = JSON.stringify({ model, operation, args, result });
  return Buffer.from(data).toString("base64").substring(0, 64);
}
```

**Purpose**: Prevents duplicate event processing when events are both:

1. Processed locally (source: 'local')
2. Received back via MQTT (source: 'remote')

### Automatic Event Deduplication (NEW in v2.1.11!)

```
Event Flow with Deduplication:

Server 1: Creates user with emit: true
    ↓
1. Local listeners execute (source: 'local')
   Event ID: abc123 → stored in processedLocalEvents map
    ↓
2. Publish to MQTT (with eventId: abc123)
    ↓
3. MQTT broadcasts to all subscribers (including Server 1)
    ↓
4. Server 1 receives MQTT message (eventId: abc123)
    ↓
5. Check: wasProcessedLocally(abc123)? → YES
    ↓
6. Skip execution (already processed locally)
    ↓
Result: Listener executes ONCE, not twice!
```

**Deduplication Details:**

- Event IDs stored in memory for 5 seconds (configurable TTL)
- Automatic cleanup of expired event IDs
- Zero configuration required
- Works transparently for all listeners with `allowRemote: true`

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
✅ **Event Deduplication**: Automatic duplicate detection and prevention  
✅ **Source-based Filtering**: `remoteOnly` flag skips unnecessary processing

### Benchmarks (Typical)

```
Local event execution:     <1ms
MQTT publish:              1-5ms (async, non-blocking)
Remote event reception:    5-20ms (network latency)
Remote listener execution: <1ms
Deduplication check:       <0.1ms (in-memory lookup)

Total overhead: ~5-20ms for remote events
```

## New Features in v2.1.11

### 1. Event Source Tracking

Every listener now receives a `source` parameter indicating event origin:

```typescript
prismaEventListener("user", {
  allowRemote: true,
  listener: async ({ result, source }) => {
    if (source === "local") {
      // Event triggered on this server
      console.log("Processing local user creation");
      await processLocalUser(result);
    } else if (source === "remote") {
      // Event received from MQTT (another server)
      console.log("Syncing user from remote server");
      await syncRemoteUser(result);
    }
  },
});
```

**Benefits:**

- ✅ Conditional logic based on event origin
- ✅ Different processing for local vs remote events
- ✅ Better debugging and logging
- ✅ Enables smart caching strategies

### 2. Remote-Only Listeners

The `remoteOnly` flag allows listeners to ONLY process MQTT events:

```typescript
prismaEventListener("product", {
  allowRemote: true,
  remoteOnly: true, // ← Skip local events
  listener: async ({ result, source }) => {
    // This only runs for MQTT events (source is always 'remote')
    await syncProductFromRemoteServer(result);
  },
});
```

**Use Cases:**

- ✅ **Cross-region sync**: Only sync FROM other regions, not to self
- ✅ **Analytics aggregation**: Only count events from other services
- ✅ **Distributed caching**: Only invalidate based on remote changes
- ✅ **Microservices**: One service publishes, others consume

**Comparison:**

| Listener Type       | Local Events | Remote Events | Use Case                |
| ------------------- | ------------ | ------------- | ----------------------- |
| Default             | ✅           | ❌            | Local processing only   |
| `allowRemote: true` | ✅           | ✅            | Process all events      |
| `remoteOnly: true`  | ❌           | ✅            | Remote sync/aggregation |

### 3. Automatic Event Deduplication

**The Problem:**
When a server publishes an event to MQTT, it also subscribes to the same topic. This means it receives its own event back, potentially processing it twice.

**The Solution:**
Automatic deduplication prevents this without any configuration:

```typescript
// Your code (no changes needed)
await prisma.user.create({
  data: { email: "user@example.com" },
  emit: true,
});

prismaEventListener("user", {
  allowRemote: true,
  listener: async ({ result, source }) => {
    // This runs ONCE, not twice!
    console.log("User created:", result.email, "Source:", source);
  },
});
```

**How It Works:**

1. **Event Publishing** (Server 1):

   ```
   create() → emit: true
       ↓
   Generate eventId: "abc123"
       ↓
   Store in processedLocalEvents: { "abc123": timestamp }
       ↓
   Publish to MQTT with eventId
   ```

2. **Local Processing** (Server 1):

   ```
   Execute local listeners (source: 'local')
   ```

3. **MQTT Reception** (All servers including Server 1):

   ```
   Server 1 receives MQTT message (eventId: "abc123")
       ↓
   Check: wasProcessedLocally("abc123")? → YES
       ↓
   Skip execution (already processed)
       ↓

   Server 2 receives MQTT message (eventId: "abc123")
       ↓
   Check: wasProcessedLocally("abc123")? → NO
       ↓
   Execute listeners (source: 'remote')
   ```

**Deduplication Configuration:**

- **TTL**: 5 seconds (events older than 5s are automatically cleaned up)
- **Storage**: In-memory Map (no database or Redis needed)
- **Performance**: <0.1ms per check
- **Automatic**: Zero configuration required

**Benefits:**

- ✅ No duplicate processing when server receives its own MQTT events
- ✅ Zero configuration - works automatically
- ✅ Memory efficient - old events auto-cleanup
- ✅ Fast - in-memory lookups
- ✅ No external dependencies

### 4. Granular Emit Control

Control local and remote event emission independently:

```typescript
// Emit to local listeners only (no MQTT)
await prisma.user.update({
  where: { id: 1 },
  data: { lastSeen: new Date() },
  emit: { local: true, remote: false },
});

// Emit to MQTT only (skip local listeners)
await prisma.log.create({
  data: { message: "System event" },
  emit: { local: false, remote: true },
});

// Emit to both (same as emit: true)
await prisma.order.create({
  data: { userId: 1, total: 99.99 },
  emit: { local: true, remote: true },
});
```

**Use Cases:**

- ✅ Optimize MQTT bandwidth (skip unnecessary publishes)
- ✅ Local-only cache updates
- ✅ Remote-only event broadcasting
- ✅ Testing (disable MQTT in tests)

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
  listener: async ({ result, source }) => {
    console.log(`Invalidating cache from ${source} server`);
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
Local cache invalidated (Server 1, source: 'local')
    ↓
Extension auto-publishes to MQTT (with eventId)
    ↓
Extension auto-receives on Server 2, 3, 4
    ↓
Remote cache invalidated (Server 2, 3, 4, source: 'remote')
    ↓
Server 1 receives own MQTT message → SKIPPED (duplicate detected)
    ↓
Result: All caches synchronized (no MQTT code written!)
         No duplicate processing on Server 1!
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

**Listener (on notification server - remote only):**

```typescript
prismaEventListener("order", {
  allowRemote: true,
  remoteOnly: true, // ← Only process orders from other servers
  data: { status: "COMPLETED" },
  listener: async ({ result, source }) => {
    console.log(`Sending notification for order from ${source}`);
    await sendEmail(result.userEmail, "Order completed!");
    await sendPushNotification(result.userId);
  },
});
```

**Flow:**

```
Order Server: Order completed
    ↓
Extension publishes to MQTT automatically (with eventId)
    ↓
Notification server receives via extension
    ↓
remoteOnly listener executes (source: 'remote')
    ↓
Email sent to customer
    ↓
Push notification sent
    ↓
Result: Notifications sent without duplicate processing
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

**Listener (using remoteOnly to avoid self-replication):**

```typescript
prismaEventListener("user", {
  allowRemote: true,
  remoteOnly: true, // ← NEW: Only sync FROM other regions
  listener: async ({ result, source }) => {
    // Only runs for events from OTHER regions
    console.log(`Syncing user from ${source} region`);
    await syncToLocalDB(result);
  },
});
```

**Flow:**

```
US Server: Creates user → emit: true
    ↓
Local DB write (US)
    ↓
Extension publishes to MQTT (with eventId, no code needed)
    ↓
Extension receives on EU Server (automatic)
    ↓
remoteOnly listener executes on EU (source: 'remote')
    ↓
Extension receives on Asia Server (automatic)
    ↓
remoteOnly listener executes on Asia (source: 'remote')
    ↓
US Server receives own MQTT → SKIPPED (duplicate detected)
    ↓
Result: User available in EU and Asia regions
        No duplicate sync on US region (thanks to deduplication)
```

**Why `remoteOnly: true` matters here:**

- Without it: US server would process the event twice (local + MQTT)
- With it: US server only writes locally, other regions sync via MQTT
- Result: Clean one-way replication without duplicates

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
- **Flexible emit control**: Enable per-operation or globally with granular local/remote control
- **Smart subscriptions**: Automatic topic management based on `allowRemote`
- **Event source tracking**: Know if events are local or remote with `source` parameter
- **Remote-only listeners**: Process only MQTT events with `remoteOnly: true`
- **Automatic deduplication**: Prevent duplicate event processing (5-second TTL)
- **Production-ready**: Built-in error handling and reconnection

**User writes**: Configuration + Listeners  
**Extension handles**: All MQTT publish/subscribe operations + deduplication + source tracking
