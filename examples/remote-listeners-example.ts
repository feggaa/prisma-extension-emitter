/**
 * Example: Remote Listeners with allowRemote
 * 
 * This example shows how to use allowRemote: true to listen
 * to events from other servers without writing MQTT code.
 */

import { PrismaClient } from '@prisma/client';
import { listenerExtensionConfig, prismaEventListener, disconnectMqtt } from '../dist';

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';

// ============================================
// Setup: Common Configuration
// ============================================
function setupPrismaWithMqtt(serverName: string) {
  return new PrismaClient().$extends(
    listenerExtensionConfig({
      emit: true,
      mqtt: {
        enabled: true,
        brokerUrl: MQTT_BROKER,
        topicPrefix: 'example/events',
        options: {
          clientId: serverName,
        }
      }
    })
  );
}

// ============================================
// Example 1: Cache Invalidation Across Servers
// ============================================

// Simulated cache
const cache = new Map<string, any>();

function setupCacheInvalidation(serverName: string) {
  console.log(`\n[${serverName}] Setting up cache invalidation listener`);
  
  // This listener runs on ALL servers
  prismaEventListener('user', {
    allowRemote: true,  // ← Listen to events from all servers!
    listener: async ({ result }: any) => {
      const cacheKey = `user:${result.id}`;
      
      if (cache.has(cacheKey)) {
        cache.delete(cacheKey);
        console.log(`[${serverName}] 🗑️  Cache invalidated: ${cacheKey}`);
      } else {
        console.log(`[${serverName}] ℹ️  Cache miss: ${cacheKey}`);
      }
    }
  });
  
  console.log(`[${serverName}] ✅ Cache invalidation listener active`);
}

// ============================================
// Example 2: Filtered Remote Listeners
// ============================================

function setupVIPNotifications(serverName: string) {
  console.log(`\n[${serverName}] Setting up VIP user notifications`);
  
  // Only listen to VIP users from any server
  prismaEventListener('user', {
    allowRemote: true,
    data: { 
      role: 'VIP'  // Only VIP users
    },
    listener: async ({ result }: any) => {
      console.log(`[${serverName}] 👑 VIP user created: ${result.name} (${result.email})`);
      // Send special welcome email, notify sales team, etc.
    }
  });
  
  console.log(`[${serverName}] ✅ VIP notifications listener active`);
}

// ============================================
// Example 3: Analytics from All Servers
// ============================================

let eventCount = 0;

function setupAnalytics(serverName: string) {
  console.log(`\n[${serverName}] Setting up analytics`);
  
  // Track all user creations from all servers
  prismaEventListener('user', {
    allowRemote: true,
    listener: async ({ result, args }: any) => {
      eventCount++;
      console.log(`[${serverName}] 📊 Analytics: User created (Total: ${eventCount})`);
      console.log(`  - ID: ${result.id}`);
      console.log(`  - Name: ${result.name}`);
      console.log(`  - Email: ${result.email}`);
    }
  });
  
  console.log(`[${serverName}] ✅ Analytics listener active`);
}

// ============================================
// Example 4: Local vs Remote Events
// ============================================

function setupLocalAndRemote(serverName: string) {
  console.log(`\n[${serverName}] Setting up local and remote listeners`);
  
  // Local-only listener
  prismaEventListener('user', {
    // allowRemote not set = local only
    listener: async ({ result }: any) => {
      console.log(`[${serverName}] 🏠 Local event: ${result.name}`);
    }
  });
  
  // Remote-only listener (runs for all events including local)
  prismaEventListener('user', {
    allowRemote: true,
    listener: async ({ result }: any) => {
      console.log(`[${serverName}] 🌍 Remote event: ${result.name}`);
    }
  });
  
  console.log(`[${serverName}] ✅ Local and remote listeners active`);
}

// ============================================
// Simulate Multiple Servers
// ============================================

async function simulateServer1() {
  console.log('\n========================================');
  console.log('SERVER 1: Starting');
  console.log('========================================');
  
  const prisma = setupPrismaWithMqtt('server-1');
  
  // Setup listeners (these run on Server 1)
  setupCacheInvalidation('server-1');
  setupVIPNotifications('server-1');
  
  // Wait for MQTT to connect
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n[server-1] Creating user...');
  
  // Create a user - this will trigger events on ALL servers
  const user = await prisma.user.create({
    data: {
      name: 'Alice',
      email: 'alice@example.com',
      role: 'VIP'
    },
    emit: true
  });
  
  console.log(`[server-1] ✅ User created: ${user.id}`);
  
  // Wait for events to propagate
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await prisma.$disconnect();
  return user;
}

async function simulateServer2() {
  console.log('\n========================================');
  console.log('SERVER 2: Starting (Listener Only)');
  console.log('========================================');
  
  const prisma = setupPrismaWithMqtt('server-2');
  
  // Setup listeners (these run on Server 2)
  setupCacheInvalidation('server-2');
  setupVIPNotifications('server-2');
  setupAnalytics('server-2');
  
  console.log('\n[server-2] 👂 Listening for events from other servers...');
  
  // Keep server running to receive events
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await prisma.$disconnect();
}

async function simulateServer3() {
  console.log('\n========================================');
  console.log('SERVER 3: Starting (Listener Only)');
  console.log('========================================');
  
  const prisma = setupPrismaWithMqtt('server-3');
  
  // Setup listeners (these run on Server 3)
  setupLocalAndRemote('server-3');
  
  console.log('\n[server-3] 👂 Listening for events from other servers...');
  
  // Keep server running to receive events
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await prisma.$disconnect();
}

// ============================================
// Main Demo
// ============================================

async function runDemo() {
  console.log('===========================================');
  console.log('Remote Listeners Demo with allowRemote');
  console.log('===========================================');
  console.log('MQTT Broker:', MQTT_BROKER);
  console.log('===========================================');
  
  try {
    // Start all servers in parallel
    await Promise.all([
      simulateServer1(),
      simulateServer2(),
      simulateServer3(),
    ]);
    
    console.log('\n===========================================');
    console.log('Demo Complete!');
    console.log('===========================================');
    console.log('\nWhat happened:');
    console.log('1. Server 1 created a user');
    console.log('2. Server 1 listener executed (local event)');
    console.log('3. Server 2 listeners executed (remote event via MQTT)');
    console.log('4. Server 3 listeners executed (remote event via MQTT)');
    console.log('\nAll without writing any MQTT subscription code! ✨');
    console.log('===========================================');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await disconnectMqtt();
  }
}

// ============================================
// Interactive Mode
// ============================================

async function interactiveMode() {
  const mode = process.argv[2] || 'demo';
  
  switch (mode) {
    case 'server1':
      await simulateServer1();
      await disconnectMqtt();
      break;
      
    case 'server2':
      await simulateServer2();
      await disconnectMqtt();
      break;
      
    case 'server3':
      await simulateServer3();
      await disconnectMqtt();
      break;
      
    case 'demo':
      await runDemo();
      break;
      
    default:
      console.log('Usage: ts-node remote-listeners-example.ts [demo|server1|server2|server3]');
      console.log('');
      console.log('  demo    - Run full demo with all servers');
      console.log('  server1 - Run server 1 (creates user)');
      console.log('  server2 - Run server 2 (listener only)');
      console.log('  server3 - Run server 3 (listener only)');
  }
}

// Run if executed directly
if (require.main === module) {
  interactiveMode().catch(console.error);
}

export {
  setupCacheInvalidation,
  setupVIPNotifications,
  setupAnalytics,
  setupLocalAndRemote,
};
