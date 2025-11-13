/**
 * Integration Test: Local + MQTT Events
 * 
 * This example demonstrates that both local and MQTT events work together.
 */

import { PrismaClient } from '@prisma/client';
import { listenerExtensionConfig, prismaEventListener, disconnectMqtt } from '../dist';
import * as mqtt from 'mqtt';

// Configuration
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const TOPIC_PREFIX = 'test/events';

// ============================================
// Setup Prisma with MQTT
// ============================================
const prisma = new PrismaClient().$extends(
  listenerExtensionConfig({
    emit: true,
    mqtt: {
      enabled: true,
      brokerUrl: MQTT_BROKER,
      topicPrefix: TOPIC_PREFIX,
      options: {
        clientId: 'test-publisher',
      }
    }
  })
);

// ============================================
// Setup Local Listeners
// ============================================
let localEventCount = 0;

prismaEventListener<any>('user', {
  listener: async ({ args, model, result }) => {
    localEventCount++;
    console.log(`[LOCAL EVENT ${localEventCount}] User event:`, {
      model,
      id: result.id,
      name: result.name,
    });
  }
});

// ============================================
// Setup MQTT Subscriber
// ============================================
let mqttEventCount = 0;

function setupMqttSubscriber(): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(MQTT_BROKER, {
      clientId: 'test-subscriber',
    });

    client.on('connect', () => {
      console.log('[MQTT] Subscriber connected');
      
      client.subscribe(`${TOPIC_PREFIX}/#`, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`[MQTT] Subscribed to ${TOPIC_PREFIX}/#`);
          resolve(client);
        }
      });
    });

    client.on('message', (topic, message) => {
      mqttEventCount++;
      const event = JSON.parse(message.toString());
      
      console.log(`[MQTT EVENT ${mqttEventCount}] Received:`, {
        topic,
        model: event.model,
        operation: event.operation,
        result: event.result,
      });
    });

    client.on('error', (err) => {
      console.error('[MQTT] Error:', err);
      reject(err);
    });

    setTimeout(() => {
      reject(new Error('MQTT connection timeout'));
    }, 10000);
  });
}

// ============================================
// Test Functions
// ============================================
async function testCreateUser() {
  console.log('\n--- Test: Create User ---');
  
  const user = await prisma.user.create({
    data: {
      name: 'Test User',
      email: `test${Date.now()}@example.com`,
    },
    emit: true
  });

  console.log('Created user:', user);
  return user;
}

async function testUpdateUser(userId: number) {
  console.log('\n--- Test: Update User ---');
  
  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: 'Updated User' },
    emit: true
  });

  console.log('Updated user:', user);
  return user;
}

// ============================================
// Run Tests
// ============================================
async function runTests() {
  console.log('===========================================');
  console.log('Integration Test: Local + MQTT Events');
  console.log('===========================================');
  console.log('MQTT Broker:', MQTT_BROKER);
  console.log('Topic Prefix:', TOPIC_PREFIX);
  console.log('===========================================\n');

  try {
    // Setup MQTT subscriber
    const subscriber = await setupMqttSubscriber();
    
    // Wait a bit for subscription to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Run tests
    const user = await testCreateUser();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await testUpdateUser(user.id);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Show results
    console.log('\n===========================================');
    console.log('Test Results:');
    console.log('===========================================');
    console.log('Local events received:', localEventCount);
    console.log('MQTT events received:', mqttEventCount);
    console.log('===========================================');

    if (localEventCount >= 2 && mqttEventCount >= 2) {
      console.log('✅ SUCCESS: Both local and MQTT events working!');
    } else {
      console.log('⚠️  WARNING: Some events may be missing');
      console.log('   Expected at least 2 local and 2 MQTT events');
    }

    // Cleanup
    subscriber.end();
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// ============================================
// Main
// ============================================
async function main() {
  try {
    await runTests();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await disconnectMqtt();
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { runTests };
