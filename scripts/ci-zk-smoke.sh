
#!/bin/bash
set -e

echo "Starting CI Smoke Test for ZK Auth..."

# 1. Install & Build
pnpm install
pnpm build

# 2. Check for Forbidden WASM Instantiation
echo "Checking for instantiateStreaming..."
if grep -r "instantiateStreaming" dist; then
  echo "ERROR: Forbidden instantiateStreaming found in build output!"
  exit 1
else
  echo "Clean: No instantiateStreaming found."
fi

# 3. Backend Verification Smoke Test
# We need to run the server in a way that simulate Cloudflare.
# Using 'wrangler pages dev' in background?
# Or just relying on the fact that we use `dev:cf` for manual testing.
# For CI, we can try to run a simple curl against the dev server?
# Or just run the unit/integration tests if they can target the build.

echo "Smoke test complete."
