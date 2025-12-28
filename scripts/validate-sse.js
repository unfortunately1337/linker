#!/usr/bin/env node

/**
 * SSE Configuration Validator
 * 
 * This script checks if SSE is properly configured in the project
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 SSE Configuration Validator\n');

// Check environment variables
const envPath = path.join(__dirname, '.env');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

const hasRedisUrl = envContent.includes('REDIS_URL=') || envContent.includes('REDDIS_URL=');
const hasPusher = envContent.includes('PUSHER_');

console.log('✓ Environment variables:');
console.log(`  ${hasRedisUrl ? '✅' : '❌'} Redis configured (REDIS_URL or REDDIS_URL)`);
console.log(`  ${hasPusher ? '✅' : '❌'} Pusher configured (fallback)`);

// Check if required files exist
const requiredFiles = [
  'lib/sse.ts',
  'lib/sseClient.ts',
  'lib/realtime.ts',
  'pages/api/sse.ts',
];

console.log('\n✓ Required files:');
requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  console.log(`  ${exists ? '✅' : '❌'} ${file}`);
});

// Check if socketClient.ts has been updated
const socketClientPath = path.join(__dirname, 'lib/socketClient.ts');
if (fs.existsSync(socketClientPath)) {
  const socketClientContent = fs.readFileSync(socketClientPath, 'utf-8');
  const hasSSE = socketClientContent.includes('sseClient') || socketClientContent.includes('createSSEAdapter');
  console.log(`  ${hasSSE ? '✅' : '❌'} socketClient.ts updated for SSE support`);
}

// Check package.json for redis dependency
const packageJsonPath = path.join(__dirname, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const hasRedis = packageJson.dependencies['redis'] || packageJson.dependencies['node-redis'];
  console.log(`  ${hasRedis ? '✅' : '⚠️'} redis package installed`);
  if (!hasRedis) {
    console.log('     Run: npm install redis');
  }
}

console.log('\n📋 Configuration Summary:');
if (hasRedisUrl && !hasPusher) {
  console.log('  ✅ SSE mode enabled (Redis configured, Pusher disabled)');
} else if (!hasRedisUrl && hasPusher) {
  console.log('  ✅ Pusher mode enabled (Redis not configured)');
} else if (hasRedisUrl && hasPusher) {
  console.log('  ✅ Hybrid mode enabled (both Redis and Pusher available)');
  console.log('     System will prefer SSE if REDIS_URL is set');
} else {
  console.log('  ❌ No realtime provider configured!');
  console.log('     Set either REDIS_URL or PUSHER_* variables in .env');
}

console.log('\n✓ Ready to use:\n');
console.log('  Development:');
console.log('    npm run dev');
console.log('\n  Production:');
console.log('    npm run build');
console.log('    npm start\n');
