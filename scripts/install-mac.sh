#!/usr/bin/env bash
set -euo pipefail

# Build the app
npm run build:mac

# Find the .app bundle (handles both arm64 and x64 output dirs)
APP=$(find dist -maxdepth 2 -name "April.app" | head -1)
if [ -z "$APP" ]; then
  echo "Build failed: April.app not found in dist/" >&2
  exit 1
fi

# Quit any running instance gracefully before replacing it
pkill -x "April" 2>/dev/null && sleep 1 || true

# Install (replace) into /Applications
rm -rf "/Applications/April.app"
cp -r "$APP" "/Applications/April.app"

echo "Installed: /Applications/April.app"
