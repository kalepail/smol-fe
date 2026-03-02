#!/bin/bash
set -e

echo "--- CI Smoke Test: Server-side Noir Verification ---"

# 1. Ensure project is built
if [ ! -d "dist" ]; then
  echo "Error: dist directory not found. Run pnpm build first."
  exit 1
fi

# 2. Start local workers server in background
echo "Starting local Cloudflare Workers server..."
npx wrangler pages dev dist --port 8788 > wrangler_smoke.log 2>&1 &
WRANGLER_PID=$!

# Function to kill wrangler on exit
cleanup() {
  echo "Cleaning up..."
  kill $WRANGLER_PID || true
}
trap cleanup EXIT

# 3. Wait for server to be ready
echo "Waiting for server to be ready on port 8788..."
MAX_RETRIES=30
COUNT=0
until $(curl -sf http://localhost:8788 > /dev/null); do
  if [ $COUNT -eq $MAX_RETRIES ]; then
    echo "Error: Server failed to start in time."
    cat wrangler_smoke.log
    exit 1
  fi
  sleep 1
  COUNT=$((COUNT+1))
done
echo "Server is UP."

# 4. Perform a verification request
# Using a dummy proof structure that matches the API expectation.
# The endpoint should return a 400/500 if proof is invalid,
# but we want to ensure it doesn't CRASH (e.g. WASM instantiate error).
echo "Sending ZK verification request..."
RESPONSE=$(curl -s -X POST http://localhost:8788/api/chat/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "type": "zk",
    "proof": "0x00",
    "session_key": "dummy",
    "room_id": "builders"
  }')

echo "Response received: $RESPONSE"

# Check if it crashed
if [[ "$RESPONSE" == *"Internal Server Error"* ]]; then
  echo "FAILED: Server-side crash during ZK verification."
  exit 1
fi

if [[ "$RESPONSE" == *"instantiateStreaming"* ]]; then
  echo "FAILED: instantiateStreaming error detected in response."
  exit 1
fi

echo "SUCCESS: Server-side ZK verification logic loaded and executed without crashing."
