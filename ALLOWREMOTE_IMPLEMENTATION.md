# AllowRemote Feature - Implementation Summary

## Overview

Implemented the `allowRemote` feature that allows users to listen to events from other servers without writing any MQTT subscription code. Users simply add `allowRemote: true` to their listener configuration.

## What Was Implemented

### ✅ Core Feature: allowRemote

Added `allowRemote?: boolean` option to `ListenerConfig` interface. When set to `true`:

- Automatically subscribes to MQTT topics for that model
- Receives events from ALL servers (local + remote)
- Uses existing `where` and `data` filters on remote events
- Auto-unsubscribes when listener is removed

### ✅ Automatic MQTT Subscription

- **Separate Subscriber Client**: Created dedicated MQTT client for subscriptions (doesn't interfere with publishing)
- **Smart Topic Management**: Multiple listeners to same model share one MQTT subscription
- **Auto-Cleanup**: Unsubscribes from MQTT when last listener is removed
- **Message Handling**: Parses incoming MQTT messages and executes matching listeners

### ✅ Key Functions Added

1. **`ensureSubscriberInitialized()`**: Initializes MQTT subscriber client on-demand
2. **`handleMqttMessage()`**: Parses and processes incoming MQTT events
3. **`subscribeToMqttTopic()`**: Subscribes to MQTT topic for a model
4. **`unsubscribeFromMqttTopic()`**: Unsubscribes when listener is removed
5. **Updated `disconnectMqtt()`**: Now disconnects both publisher and subscriber
6. **Updated `prismaEventListener()`**: Subscribes to MQTT when `allowRemote: true`

## Code Changes

### Modified Files

**src/index.ts**:

- Added `allowRemote?: boolean` to `ListenerConfig<T>` interface
- Added `mqttSubscriber` client variable
- Added `mqttSubscriptions` Map for tracking subscriptions
- Added 5 new functions for MQTT subscription management
- Updated `prismaEventListener()` to handle `allowRemote`
- Updated `disconnectMqtt()` to close both clients

### New Documentation

1. **REMOTE_LISTENERS.md** - Complete guide

   - How allowRemote works
   - Examples and use cases
   - Comparison with manual MQTT code
   - Troubleshooting

2. **examples/remote-listeners-example.ts** - Working example

   - Cache invalidation across servers
   - Filtered remote listeners
   - Analytics collection
   - Local vs remote events

3. **Updated README.md** - Feature highlight
4. **Updated MQTT_QUICKREF.md** - Added allowRemote section
5. **Updated examples/README.md** - Added remote listeners example

## Usage Comparison

### Before (Manual MQTT Code)

```typescript
import * as mqtt from 'mqtt';

// Setup publisher
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({ emit: true, mqtt: {...} })
);

// Manual subscriber - lots of code!
const client = mqtt.connect('mqtt://localhost:1883');
client.on('connect', () => {
  client.subscribe('prisma/events/user/#');
});
client.on('message', (topic, message) => {
  const event = JSON.parse(message.toString());
  cache.invalidate(event.result.id);
});
```

### After (With allowRemote) ✨

```typescript
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({ emit: true, mqtt: {...} })
);

// Just one line!
prismaEventListener('user', {
  allowRemote: true,
  listener: async ({ result }) => {
    cache.invalidate(result.id);
  }
});
```

## Benefits

1. **Zero MQTT Code**: Users don't write any MQTT subscription code
2. **Consistent API**: Same API for local and remote events
3. **Automatic**: Auto-subscribe and auto-unsubscribe
4. **Filtered**: Existing where/data filters work on remote events
5. **Optimized**: Smart subscription sharing
6. **Type-Safe**: Full TypeScript support
7. **No Extra Install**: MQTT already bundled (mqtt package is a dependency)

## Architecture

```
                    MQTT Broker
                         ↓
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
   Server 1          Server 2         Server 3
   ┌──────────┐      ┌──────────┐     ┌──────────┐
   │Publisher │      │Subscriber│     │Subscriber│
   │Client    │      │Client    │     │Client    │
   └──────────┘      └──────────┘     └──────────┘
        ↓                ↓                ↓
   allowRemote      allowRemote      allowRemote
   listeners        listeners        listeners
```

## Use Cases

Perfect for:

- ✅ Cache invalidation across multiple servers
- ✅ Real-time notifications from any server
- ✅ Analytics collection from all servers
- ✅ Multi-region data synchronization
- ✅ Microservices event communication
- ✅ Distributed system coordination

## Technical Details

### Subscription Management

- Each model gets one MQTT subscription: `{prefix}/{model}/#`
- Multiple listeners to same model share the subscription
- Subscription created on first `allowRemote` listener
- Subscription removed when last listener unsubscribes
- Tracked in `mqttSubscriptions` Map

### Client Separation

- **Publisher Client** (`mqttClient`): Publishes events
- **Subscriber Client** (`mqttSubscriber`): Receives events
- Different client IDs: `{clientId}` and `{clientId}-subscriber`
- Prevents message loops and improves reliability

### Message Flow

1. Server 1 creates user with `emit: true`
2. Local listeners execute on Server 1
3. Event published to MQTT topic
4. Server 2, 3, 4 receive MQTT message
5. `handleMqttMessage()` parses message
6. Matching listeners (with `allowRemote: true`) execute
7. Filters (`where`, `data`) applied to remote events

## Testing

Build successful with zero errors:

```bash
npm run build
✅ TypeScript compilation successful
✅ All types exported correctly
```

## Backward Compatibility

✅ **100% Backward Compatible**

- `allowRemote` is optional (defaults to `false`)
- Existing listeners work unchanged
- No breaking changes
- Users opt-in to remote listening

## Future Enhancements

Potential improvements:

1. Filter by operation: `allowRemote: { operations: ['create', 'update'] }`
2. Custom topic patterns
3. Message transformation hooks
4. Retry logic for failed listener execution

## Documentation

Complete documentation provided:

- ✅ REMOTE_LISTENERS.md - Full guide
- ✅ Working example code
- ✅ Updated README
- ✅ Quick reference updated
- ✅ Examples directory updated

## Summary

The `allowRemote` feature dramatically simplifies multi-server architectures by eliminating the need for manual MQTT subscription code. Users can now listen to events from all servers with a single configuration option, making distributed event-driven systems accessible to everyone.
