# MQTT Examples

This directory contains examples demonstrating MQTT event publishing functionality.

## Prerequisites

1. **Install Dependencies**:

   ```bash
   npm install
   # MQTT is already included - no separate install needed!
   ```

2. **Setup MQTT Broker**:

   You need an MQTT broker running. Here are some options:

   ### Option 1: Local Mosquitto (Recommended for testing)

   ```bash
   # macOS
   brew install mosquitto
   brew services start mosquitto

   # Ubuntu/Debian
   sudo apt-get install mosquitto
   sudo systemctl start mosquitto

   # Docker
   docker run -it -p 1883:1883 eclipse-mosquitto
   ```

   ### Option 2: Cloud MQTT Broker

   - [HiveMQ Cloud](https://www.hivemq.com/mqtt-cloud-broker/) (Free tier available)
   - [CloudMQTT](https://www.cloudmqtt.com/)
   - [AWS IoT Core](https://aws.amazon.com/iot-core/)

## Examples

### 1. Remote Listeners (`remote-listeners-example.ts`) ⭐ NEW!

**Easiest way to listen to events from other servers!**

Shows how to use `allowRemote: true` to receive events from all servers without writing MQTT subscription code:

- Cache invalidation across servers
- VIP user notifications
- Analytics collection from all servers
- Local vs remote event handling

```bash
# Run full demo with all servers
ts-node examples/remote-listeners-example.ts demo

# Or run individual servers
ts-node examples/remote-listeners-example.ts server1
ts-node examples/remote-listeners-example.ts server2
```

### 2. Simple MQTT Example (`simple-mqtt-example.ts`)

Basic example showing:

- MQTT configuration
- Local listeners + MQTT publishing
- Event subscription from other servers

### 3. Multi-Server Architecture (`mqtt-multi-server.ts`)

Complete e-commerce example with:

- **API Server**: Main application handling user operations
- **Inventory Service**: Listens to order events and manages inventory
- **Notification Service**: Sends emails/notifications based on events
- **Analytics Service**: Logs all events for analytics

## Running the Examples

### Test MQTT Connection

First, test if you can connect to your MQTT broker:

```bash
# Install mosquitto clients (includes mosquitto_pub and mosquitto_sub)
brew install mosquitto

# Subscribe to all events
mosquitto_sub -h localhost -t 'prisma/events/#' -v

# In another terminal, publish a test message
mosquitto_pub -h localhost -t 'prisma/events/test' -m 'Hello MQTT!'
```

### Run the Multi-Server Example

Terminal 1 - Start inventory service:

```bash
ts-node examples/mqtt-multi-server.ts inventory
```

Terminal 2 - Start notification service:

```bash
ts-node examples/mqtt-multi-server.ts notifications
```

Terminal 3 - Start analytics service:

```bash
ts-node examples/mqtt-multi-server.ts analytics
```

Terminal 4 - Run API operations:

```bash
ts-node examples/mqtt-multi-server.ts api
```

You should see events being published by the API server and received by all other services!

## Event Topics Structure

Events are published to topics following this pattern:

```
{topicPrefix}/{model}/{operation}
```

Examples:

- `prisma/events/user/create`
- `prisma/events/user/update`
- `prisma/events/order/create`
- `prisma/events/product/updateMany`

## Environment Variables

Create a `.env` file:

```env
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=your-username
MQTT_PASSWORD=your-password
```

## Debugging

Monitor MQTT traffic:

```bash
# Subscribe to all topics
mosquitto_sub -h localhost -t '#' -v

# Subscribe to specific model events
mosquitto_sub -h localhost -t 'prisma/events/user/#' -v
```

## Common Issues

1. **Connection Refused**: Make sure MQTT broker is running

   ```bash
   # Check if mosquitto is running
   brew services list | grep mosquitto
   ```

2. **No events received**: Check that `emit: true` is set on operations

3. **Events not publishing**: Check console for MQTT connection errors

## Learn More

See [MQTT_USAGE.md](../MQTT_USAGE.md) for complete documentation.
