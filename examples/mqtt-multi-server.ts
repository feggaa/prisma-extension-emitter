/**
 * Example: Multi-Server Architecture with MQTT
 * 
 * This example demonstrates how to use MQTT to synchronize events
 * across multiple servers or separate applications.
 * 
 * Scenario: E-commerce application with separate servers for:
 * - Server 1: Main API (handles user operations)
 * - Server 2: Inventory service (listens to order events)
 * - Server 3: Notification service (sends emails/notifications)
 */

import { PrismaClient } from '@prisma/client';
import { listenerExtensionConfig, prismaEventListener, disconnectMqtt } from '../dist';
import * as mqtt from 'mqtt';

// ============================================
// SERVER 1: Main API Server (Primary Writer)
// ============================================
function setupMainApiServer() {
  const prisma = new PrismaClient().$extends(
    listenerExtensionConfig({
      emit: {
        emitOnCreate: true,
        emitOnUpdate: true,
        emitOnUpdateMany: true,
      },
      
      // MQTT Configuration
      mqtt: {
        enabled: true,
        brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
        topicPrefix: 'ecommerce/events',
        options: {
          clientId: 'api-server-1',
          username: process.env.MQTT_USERNAME,
          password: process.env.MQTT_PASSWORD,
          clean: true,
          reconnectPeriod: 5000,
        }
      }
    })
  );

  // Local listener still works!
  prismaEventListener('user', {
    listener: async ({ args, model, result }: any) => {
      console.log('[LOCAL] User event processed locally:', result.id);
      // Update local cache, logs, etc.
      console
    }
  });

  return prisma;
}

// Example: Create a user on main server
async function createUserExample() {
  const prisma = setupMainApiServer();
  
  const user = await prisma.user.create({
    data: {
      name: 'John Doe',
      email: 'john@example.com',
    },
    emit: true  // This triggers both local listeners AND MQTT publish
  });

  console.log('[API] User created:', user);
  
  // Event is now published to: ecommerce/events/user/create
  // Other servers can listen to this topic!
  
  await prisma.$disconnect();
  await disconnectMqtt();
}

// ============================================
// SERVER 2: Inventory Service (Event Consumer)
// ============================================
function setupInventoryService() {
  const mqttClient = mqtt.connect(
    process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    {
      clientId: 'inventory-service',
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
    }
  );

  mqttClient.on('connect', () => {
    console.log('[INVENTORY] Connected to MQTT broker');
    
    // Subscribe to order events from main server
    mqttClient.subscribe('ecommerce/events/order/#', (err) => {
      if (!err) {
        console.log('[INVENTORY] Subscribed to order events');
      }
    });
  });

  mqttClient.on('message', async (topic, message) => {
    const event = JSON.parse(message.toString());
    
    console.log('[INVENTORY] Received event:', {
      topic,
      operation: event.operation,
      model: event.model,
    });

    // Handle different order operations
    if (event.model === 'order' && event.operation === 'create') {
      // Reduce inventory based on order
      console.log('[INVENTORY] Processing new order:', event.result.id);
      // await reduceInventory(event.result.items);
    }
    
    if (event.model === 'order' && event.operation === 'update') {
      // Handle order updates (cancellations, etc.)
      if (event.result.status === 'cancelled') {
        console.log('[INVENTORY] Restoring inventory for cancelled order');
        // await restoreInventory(event.result.items);
      }
    }
  });

  mqttClient.on('error', (err) => {
    console.error('[INVENTORY] MQTT error:', err);
  });

  return mqttClient;
}

// ============================================
// SERVER 3: Notification Service
// ============================================
function setupNotificationService() {
  const mqttClient = mqtt.connect(
    process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    {
      clientId: 'notification-service',
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
    }
  );

  mqttClient.on('connect', () => {
    console.log('[NOTIFICATIONS] Connected to MQTT broker');
    
    // Subscribe to user and order events
    mqttClient.subscribe([
      'ecommerce/events/user/create',
      'ecommerce/events/order/#',
    ], (err) => {
      if (!err) {
        console.log('[NOTIFICATIONS] Subscribed to user and order events');
      }
    });
  });

  mqttClient.on('message', async (topic, message) => {
    const event = JSON.parse(message.toString());
    
    console.log('[NOTIFICATIONS] Received event:', {
      topic,
      operation: event.operation,
    });

    // Send welcome email when user is created
    if (event.model === 'user' && event.operation === 'create') {
      console.log(`[NOTIFICATIONS] Sending welcome email to ${event.result.email}`);
      // await sendWelcomeEmail(event.result.email, event.result.name);
    }

    // Send order confirmation
    if (event.model === 'order' && event.operation === 'create') {
      console.log(`[NOTIFICATIONS] Sending order confirmation for order ${event.result.id}`);
      // await sendOrderConfirmation(event.result);
    }

    // Send order status updates
    if (event.model === 'order' && event.operation === 'update') {
      console.log(`[NOTIFICATIONS] Sending order update notification`);
      // await sendOrderUpdate(event.result);
    }
  });

  return mqttClient;
}

// ============================================
// SERVER 4: Analytics/Logging Service
// ============================================
function setupAnalyticsService() {
  const mqttClient = mqtt.connect(
    process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    {
      clientId: 'analytics-service',
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
    }
  );

  mqttClient.on('connect', () => {
    console.log('[ANALYTICS] Connected to MQTT broker');
    
    // Subscribe to ALL events
    mqttClient.subscribe('ecommerce/events/#', (err) => {
      if (!err) {
        console.log('[ANALYTICS] Subscribed to all events');
      }
    });
  });

  mqttClient.on('message', async (topic, message) => {
    const event = JSON.parse(message.toString());
    
    // Log all database operations for analytics
    console.log('[ANALYTICS] Event logged:', {
      timestamp: event.timestamp,
      model: event.model,
      operation: event.operation,
      // You could send this to your analytics platform
      // await analytics.track(`${event.model}.${event.operation}`, event.result);
    });
  });

  return mqttClient;
}

// ============================================
// Main Application
// ============================================
async function main() {
  const mode = process.argv[2] || 'api';

  switch (mode) {
    case 'api':
      console.log('Starting API Server...');
      await createUserExample();
      break;

    case 'inventory':
      console.log('Starting Inventory Service...');
      setupInventoryService();
      // Keep running
      await new Promise(() => {});
      break;

    case 'notifications':
      console.log('Starting Notification Service...');
      setupNotificationService();
      // Keep running
      await new Promise(() => {});
      break;

    case 'analytics':
      console.log('Starting Analytics Service...');
      setupAnalyticsService();
      // Keep running
      await new Promise(() => {});
      break;

    default:
      console.log('Usage: ts-node mqtt-example.ts [api|inventory|notifications|analytics]');
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await disconnectMqtt();
  process.exit(0);
});

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  setupMainApiServer,
  setupInventoryService,
  setupNotificationService,
  setupAnalyticsService,
};
