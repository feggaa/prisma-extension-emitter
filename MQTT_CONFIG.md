# MQTT Configuration Guide

This guide covers all MQTT configuration options and common setups.

## Basic Configuration

```typescript
mqtt: {
  enabled: true,
  brokerUrl: 'mqtt://localhost:1883',
}
```

## Full Configuration

```typescript
mqtt: {
  enabled: true,
  brokerUrl: 'mqtt://broker.example.com:1883',
  topicPrefix: 'myapp/events',
  options: {
    clientId: 'unique-client-id',
    username: 'mqtt-user',
    password: 'mqtt-pass',
    clean: true,
    reconnectPeriod: 5000,
    keepalive: 60,
    protocolVersion: 5,
    // ... more options available from mqtt.IClientOptions
  }
}
```

## Configuration Options

### `enabled` (required)

- **Type**: `boolean`
- **Description**: Enable or disable MQTT publishing
- **Example**: `true`

### `brokerUrl` (required)

- **Type**: `string`
- **Description**: MQTT broker connection URL
- **Formats**:
  - `mqtt://host:port` - TCP connection
  - `mqtts://host:port` - TLS/SSL connection
  - `ws://host:port/path` - WebSocket connection
  - `wss://host:port/path` - Secure WebSocket
- **Examples**:
  ```typescript
  "mqtt://localhost:1883";
  "mqtts://broker.example.com:8883";
  "ws://broker.example.com:8080/mqtt";
  ```

### `topicPrefix` (optional)

- **Type**: `string`
- **Default**: `'prisma/events'`
- **Description**: Prefix for all published topics
- **Topic Format**: `{topicPrefix}/{model}/{operation}`
- **Examples**:
  - `'myapp/events'` → `myapp/events/user/create`
  - `'prod/db'` → `prod/db/order/update`
  - `'dev/events'` → `dev/events/product/delete`

### `options` (optional)

- **Type**: `mqtt.IClientOptions`
- **Description**: MQTT client connection options
- **Common Options**:

  #### `clientId`

  - Unique identifier for the MQTT client
  - Auto-generated if not provided
  - Example: `'server-1'`, `'api-prod-01'`

  #### `username` / `password`

  - Authentication credentials
  - Example:
    ```typescript
    username: 'mqtt-user',
    password: 'secure-password'
    ```

  #### `clean`

  - **Type**: `boolean`
  - **Default**: `true`
  - Clean session flag (start fresh vs resume session)

  #### `reconnectPeriod`

  - **Type**: `number` (milliseconds)
  - **Default**: `1000`
  - Time between reconnection attempts
  - Example: `5000` (5 seconds)

  #### `keepalive`

  - **Type**: `number` (seconds)
  - **Default**: `60`
  - Keep-alive interval

  #### `protocol`

  - **Type**: `'mqtt' | 'mqtts' | 'ws' | 'wss'`
  - Connection protocol

  #### `protocolVersion`

  - **Type**: `3 | 4 | 5`
  - MQTT protocol version
  - `4` = MQTT 3.1.1 (recommended)
  - `5` = MQTT 5.0

  #### `qos`

  - **Type**: `0 | 1 | 2`
  - Quality of Service level for subscriptions
  - Publishing always uses QoS 1 in this extension

## Common Setups

### 1. Development (Local Mosquitto)

```typescript
mqtt: {
  enabled: true,
  brokerUrl: 'mqtt://localhost:1883',
  topicPrefix: 'dev/events',
  options: {
    clientId: `dev-${process.env.HOSTNAME}`,
  }
}
```

### 2. Production (HiveMQ Cloud)

```typescript
mqtt: {
  enabled: true,
  brokerUrl: 'mqtts://your-cluster.hivemq.cloud:8883',
  topicPrefix: 'prod/events',
  options: {
    clientId: `prod-server-${process.env.SERVER_ID}`,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clean: true,
    reconnectPeriod: 5000,
    keepalive: 60,
  }
}
```

### 3. AWS IoT Core

```typescript
import * as fs from 'fs';

mqtt: {
  enabled: true,
  brokerUrl: 'mqtts://your-endpoint.iot.us-east-1.amazonaws.com:8883',
  topicPrefix: 'aws/events',
  options: {
    clientId: 'prisma-client',
    protocol: 'mqtts',
    cert: fs.readFileSync('./certs/certificate.pem'),
    key: fs.readFileSync('./certs/private.key'),
    ca: fs.readFileSync('./certs/AmazonRootCA1.pem'),
  }
}
```

### 4. Azure IoT Hub

```typescript
mqtt: {
  enabled: true,
  brokerUrl: 'mqtts://your-hub.azure-devices.net:8883',
  topicPrefix: 'azure/events',
  options: {
    clientId: 'device-id',
    username: 'your-hub.azure-devices.net/device-id/?api-version=2021-04-12',
    password: 'SharedAccessSignature sr=...',
    protocol: 'mqtts',
  }
}
```

### 5. CloudMQTT

```typescript
mqtt: {
  enabled: true,
  brokerUrl: 'mqtt://your-instance.cloudmqtt.com:port',
  topicPrefix: 'app/events',
  options: {
    username: 'cloudmqtt-username',
    password: 'cloudmqtt-password',
  }
}
```

### 6. Self-Hosted with Authentication

```typescript
mqtt: {
  enabled: true,
  brokerUrl: 'mqtt://mqtt.yourcompany.com:1883',
  topicPrefix: 'company/events',
  options: {
    clientId: `app-${process.env.NODE_ENV}-${process.env.INSTANCE_ID}`,
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS,
    clean: false, // Persistent session
    reconnectPeriod: 3000,
    will: {
      topic: 'company/events/status',
      payload: JSON.stringify({ status: 'offline' }),
      qos: 1,
      retain: true
    }
  }
}
```

## Environment-Based Configuration

```typescript
// config/mqtt.ts
export function getMqttConfig() {
  const env = process.env.NODE_ENV || "development";

  const configs = {
    development: {
      enabled: true,
      brokerUrl: "mqtt://localhost:1883",
      topicPrefix: "dev/events",
    },
    staging: {
      enabled: true,
      brokerUrl: process.env.MQTT_BROKER_URL!,
      topicPrefix: "staging/events",
      options: {
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
      },
    },
    production: {
      enabled: true,
      brokerUrl: process.env.MQTT_BROKER_URL!,
      topicPrefix: "prod/events",
      options: {
        clientId: `prod-${process.env.SERVER_ID}`,
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        clean: true,
        reconnectPeriod: 5000,
        keepalive: 60,
      },
    },
  };

  return configs[env as keyof typeof configs];
}

// Usage
import { getMqttConfig } from "./config/mqtt";

const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: true,
    mqtt: getMqttConfig(),
  })
);
```

## Disabling MQTT

```typescript
// Disable MQTT while keeping local events
mqtt: {
  enabled: false,
  brokerUrl: '', // Not used when disabled
}

// Or simply omit the mqtt config
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: true,
    // No mqtt config = MQTT disabled
  })
);
```

## Testing MQTT Configuration

```typescript
import * as mqtt from "mqtt";

// Test connection manually
function testMqttConnection() {
  const client = mqtt.connect("mqtt://localhost:1883", {
    clientId: "test-client",
  });

  client.on("connect", () => {
    console.log("✅ MQTT connected successfully");
    client.end();
  });

  client.on("error", (err) => {
    console.error("❌ MQTT connection failed:", err);
  });

  setTimeout(() => {
    if (!client.connected) {
      console.error("❌ MQTT connection timeout");
      client.end();
    }
  }, 5000);
}

testMqttConnection();
```

## Troubleshooting

### Connection Refused

- Check if broker is running: `telnet localhost 1883`
- Verify firewall rules
- Check broker URL and port

### Authentication Failed

- Verify username/password
- Check broker access control lists (ACL)
- Ensure client has publish permissions

### Events Not Publishing

- Check `enabled: true` is set
- Verify `emit: true` on operations
- Check console for connection errors
- Monitor broker logs

### SSL/TLS Issues

- Verify certificate paths are correct
- Check certificate validity
- Ensure CA certificate is correct
- Use `rejectUnauthorized: false` for self-signed certs (dev only!)

## Security Best Practices

1. **Use TLS in Production**: Always use `mqtts://` in production
2. **Strong Authentication**: Use strong passwords or certificates
3. **Topic ACLs**: Configure broker ACLs to restrict topic access
4. **Rotate Credentials**: Regularly rotate MQTT credentials
5. **Monitor Access**: Log and monitor MQTT connections
6. **Network Isolation**: Use VPC/private networks when possible
7. **Separate Environments**: Use different brokers or prefixes per environment

## References

- [MQTT.js Documentation](https://github.com/mqttjs/MQTT.js)
- [MQTT Protocol Specification](http://mqtt.org/)
- [HiveMQ Cloud](https://www.hivemq.com/)
- [Eclipse Mosquitto](https://mosquitto.org/)
