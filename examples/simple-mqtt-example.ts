/**
 * Simple MQTT Example
 * 
 * This example shows basic MQTT integration with local events.
 */

import { PrismaClient } from '@prisma/client';
import { listenerExtensionConfig, prismaEventListener, disconnectMqtt } from '../dist';
import * as mqtt from 'mqtt';

// ============================================
// Step 1: Configure Prisma with MQTT
// ============================================

const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    // Enable events
    emit: true,  // or configure specific operations
    
    // Configure MQTT
    mqtt: {
      enabled: true,
      brokerUrl: 'mqtt://localhost:1883',
      topicPrefix: 'myapp/events',  // Optional, defaults to 'prisma/events'
      options: {
        clientId: 'my-app-server-1',
        // Add authentication if needed:
        // username: 'your-username',
        // password: 'your-password',
      }
    }
  })
);

// ============================================
// Step 2: Set up local listeners (optional)
// ============================================

prismaEventListener('user', {
  listener: async ({ args, model, result }: any) => {
    console.log('Local listener - User event:', result);
    // This runs in the same process immediately
  }
});

// ============================================
// Step 3: Perform database operations
// ============================================

async function main() {
  // Create a user
  // This will:
  // 1. Execute local listeners
  // 2. Publish to MQTT topic: myapp/events/user/create
  const user = await prisma.user.create({
    data: {
      name: 'Alice',
      email: 'alice@example.com',
    },
    emit: true
  });

  console.log('User created:', user);

  // Update a user
  // Publishes to: myapp/events/user/update
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { name: 'Alice Smith' },
    emit: true
  });

  console.log('User updated:', updated);
}

// ============================================
// Step 4: Listen to events from other servers
// ============================================

function setupEventListener() {
  const client = mqtt.connect('mqtt://localhost:1883', {
    clientId: 'my-app-server-2'
  });

  client.on('connect', () => {
    console.log('Connected to MQTT broker');
    
    // Subscribe to all user events
    client.subscribe('myapp/events/user/#');
  });

  client.on('message', (topic, message) => {
    const event = JSON.parse(message.toString());
    
    console.log('Received event from another server:');
    console.log('  Topic:', topic);
    console.log('  Model:', event.model);
    console.log('  Operation:', event.operation);
    console.log('  Result:', event.result);
    console.log('  Timestamp:', event.timestamp);
    
    // Handle the event
    // - Invalidate cache
    // - Update UI
    // - Sync data
    // - Send notifications
  });
}

// ============================================
// Run it!
// ============================================

// Server 1: Writes data
main()
  .catch(console.error)
  .finally(async () => {
    await disconnectMqtt();
    await prisma.$disconnect();
  });

// Server 2: Listens to events
// setupEventListener();
