#!/bin/sh
set -e

echo "--- STARTING DIAGNOSTICS ---"

echo ""
echo "Environment variables:"
env | sort

echo ""
echo "Listing contents of root directory (/):"
ls -l /

echo ""
echo "Listing contents of /tmp:"
ls -l /tmp

echo ""
echo "Listing contents of /usr/local/bin:"
ls -l /usr/local/bin

echo ""
echo "Checking Node.js installation:"
node --version
npm --version

echo ""
TARGET_BINARY="/usr/local/bin/convex-local-backend"
echo "Checking for target binary at ${TARGET_BINARY}..."

if [ -f "${TARGET_BINARY}" ]; then
  echo "SUCCESS: Binary found."
  echo ""
  echo "Checking file type and permissions:"
  file "${TARGET_BINARY}"
  echo ""
  echo "Checking for dynamic library dependencies with ldd:"
  ldd "${TARGET_BINARY}" || echo "ldd command failed or produced no output."
else
  echo "ERROR: Binary not found at ${TARGET_BINARY}. Installation may have failed."
  exit 1
fi

echo ""
echo "--- ENDING DIAGNOSTICS ---"
echo ""

# Hardcoded instance secret (must be exactly 64 hex characters = 32 bytes)
INSTANCE_SECRET="4361726e697461732c206c69746572616c6c79206d65616e696e6720226c6974"

echo "Starting Convex backend in background..."
/usr/local/bin/convex-local-backend -p 9755 --site-proxy-port 9756 --instance-secret "$INSTANCE_SECRET" --instance-name local &
CONVEX_PID=$!

# Wait for Convex to be ready
echo "Waiting for Convex backend to initialize..."
sleep 5

echo ""
echo "--- SETTING UP NODE SERVER ---"
cd /server

# Set environment variables directly (in case ENV directives were overridden)
CONVEX_URL="${CONVEX_URL:-http://127.0.0.1:9755}"
CONVEX_SELF_HOSTED_URL="${CONVEX_SELF_HOSTED_URL:-http://127.0.0.1:9755}"
CONVEX_ADMIN_KEY="${CONVEX_ADMIN_KEY:-local|01aa43300ecc6cd85cdec2629a81179343cf65e38a753c254e1e54283f63b6dbc628ffda4a}"
CONVEX_SELF_HOSTED_ADMIN_KEY="${CONVEX_SELF_HOSTED_ADMIN_KEY:-$CONVEX_ADMIN_KEY}"

# Unset CONVEX_DEPLOYMENT if it exists (conflicts with self-hosted)
unset CONVEX_DEPLOYMENT

# Debug: Check if variables are set in the shell
echo "DEBUG: Checking environment variables in shell:"
echo "CONVEX_URL in shell: '$CONVEX_URL'"
echo "CONVEX_SELF_HOSTED_URL in shell: '$CONVEX_SELF_HOSTED_URL'"
echo "CONVEX_ADMIN_KEY starts with: '${CONVEX_ADMIN_KEY%%|*}'"

# Export environment variables so they're available to npm/npx processes
export CONVEX_URL
export CONVEX_SELF_HOSTED_URL
export CONVEX_ADMIN_KEY
export CONVEX_SELF_HOSTED_ADMIN_KEY

echo "Installing npm dependencies..."
npm install

echo "Building Convex functions..."
echo "Running: npx convex deploy --cmd-url-env-var-name CONVEX_URL --admin-key <redacted>"
echo "CONVEX_URL is: $CONVEX_URL"
echo "CONVEX_SELF_HOSTED_URL is: $CONVEX_SELF_HOSTED_URL"
echo "CONVEX_ADMIN_KEY is set: ${CONVEX_ADMIN_KEY:+yes}"

timeout 60 npx convex deploy --cmd-url-env-var-name CONVEX_URL --admin-key "$CONVEX_ADMIN_KEY" || {
  CONVEX_DEPLOY_EXIT=$?
  echo "ERROR: Convex deploy failed or timed out with exit code: $CONVEX_DEPLOY_EXIT"
  if [ $CONVEX_DEPLOY_EXIT -eq 124 ]; then
    echo "Deploy timed out after 60 seconds"
  fi
  exit 1
}

echo "Convex deploy completed successfully!"

echo "Building TypeScript..."
npm run build

echo "Starting Node.js server..."
npm run start:ts &
NODE_PID=$!

echo "Node.js server started with PID: $NODE_PID"

# Check if Convex backend is still running
if ! kill -0 $CONVEX_PID 2>/dev/null; then
  echo "ERROR: Convex backend process died!"
  exit 1
fi

echo ""
echo "--- ALL PROCESSES STARTED ---"
echo "Convex backend PID: $CONVEX_PID"
echo "Node.js server PID: $NODE_PID"
echo ""

# Trap signals to cleanly shut down all processes
trap 'echo "Shutting down..."; kill $CONVEX_PID $NODE_PID 2>/dev/null; exit' INT TERM

# Wait for all processes (this will block until they all exit)
wait

