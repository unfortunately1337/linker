#!/bin/bash

# Quick Redis test
# Usage: bash redis-test.sh

echo "🔴 Testing Redis connection..."
echo ""

REDIS_URL="redis://default:rtji0pkppkbpuoqe@194.34.239.48:6379"

echo "Redis URL: $REDIS_URL"
echo ""

# Test PING
echo "1️⃣ Testing PING..."
redis-cli -u "$REDIS_URL" PING
if [ $? -eq 0 ]; then
  echo "✅ PING successful"
else
  echo "❌ PING failed"
  exit 1
fi

echo ""
echo "2️⃣ Testing PSUBSCRIBE (will listen for 5 seconds)..."
echo "Open another terminal and run:"
echo "  redis-cli -u '$REDIS_URL' PUBLISH 'chat-test' '{\"type\":\"test\"}'"
echo ""

timeout 5 redis-cli -u "$REDIS_URL" PSUBSCRIBE "chat-*" || true

echo ""
echo "3️⃣ If you saw 'message' above, Redis pub/sub works! ✅"
echo ""
echo "Next steps:"
echo "1. Run: npm run dev"
echo "2. Open browser at http://localhost:3000"
echo "3. Check DevTools Console for [SSE-*] logs"
echo "4. Send a message and check logs"
