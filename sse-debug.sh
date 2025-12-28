#!/bin/bash

# SSE Debug Helper Script
# Run this to help diagnose SSE issues

echo "🔍 SSE Diagnostics Check"
echo "========================"
echo ""

# Check Redis connection
echo "1️⃣  Testing Redis connection..."
echo "Run this in another terminal:"
echo "redis-cli -u 'redis://default:rtji0pkppkbpuoqe@194.34.239.48:6379' PING"
echo ""

# Check logs
echo "2️⃣  Watch server logs:"
echo "Look for:"
echo "  ✅ [SSE-INIT] ✅ Redis clients connected"
echo "  ✅ [SSE-ENDPOINT] GET /api/sse"
echo "  ✅ [SSE-ENDPOINT] ✅ Connection registered"
echo ""

# Check browser console
echo "3️⃣  Check browser DevTools → Console:"
echo "  ✅ [SSE-CLIENT] 🔌 Connecting to /api/sse"
echo "  ✅ [SSE-CLIENT] ✅ Connected"
echo "  ✅ [CHAT] 📤 Sending message (when you send)"
echo "  ✅ [CHAT] 📨 Received new-message event (on receiver)"
echo ""

# Test redis pub/sub
echo "4️⃣  Test Redis Pub/Sub:"
echo "Terminal 1:"
echo "  redis-cli PSUBSCRIBE '*'"
echo ""
echo "Terminal 2 (after receiving):  "
echo "  redis-cli PUBLISH 'chat-test' '{\"type\":\"test\",\"data\":{},\"timestamp\":123}'"
echo ""

# Manual test
echo "5️⃣  Manual Test:"
echo "1. Open DevTools → Network tab"
echo "2. Filter by 'sse'"
echo "3. Refresh page"
echo "4. Check /api/sse endpoint:"
echo "   - Status should be 200"
echo "   - Type should be 'EventStream'"
echo "5. In Console tab, write:"
echo "   console.log(window.__userId)"
echo "   console.log(window.__chatId)"
echo "6. Send a message and check for:"
echo "   [CHAT] 📤 Sending message"
echo "   [CHAT] ✅ Message sent"
echo ""

echo "📋 Complete logs reference: SSE_DIAGNOSTICS.md"
