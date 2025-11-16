#!/bin/sh
set -e

echo "--- STARTING DIAGNOSTICS ---"

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
fi

echo ""
echo "--- ENDING DIAGNOSTICS ---"
echo ""

echo "Attempting to start Convex backend..."

# Hardcoded instance secret (must be exactly 64 hex characters = 32 bytes)
INSTANCE_SECRET="4361726e697461732c206c69746572616c6c79206d65616e696e6720226c6974"

# Run the Convex backend
/usr/local/bin/convex-local-backend -p 9755 --site-proxy-port 9756 --instance-secret "$INSTANCE_SECRET" --instance-name local
